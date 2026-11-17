import csv, hashlib, io, json, math, os, secrets, threading
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from fastapi import FastAPI, HTTPException, Depends, Header, UploadFile, File, Query, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field, ConfigDict
from .analytics import audio_features, classify, forecast
from .pretrained import status as ai_status, recognise
from .store import db as open_db, init_schema, is_duplicate
from starlette.concurrency import run_in_threadpool

ROOT=Path(__file__).resolve().parent.parent
def setting(name, default=None):
    value=os.getenv('KAANAM_'+name)
    if value is None:value=os.getenv('NOISE_'+name)
    return default if value is None else value
DATA=Path(setting('DATA_DIR',ROOT/'data')); DATA.mkdir(parents=True,exist_ok=True)
DB=DATA/'noise.db'
DEMO=setting('DEMO','1')=='1'
def load_admin():
    configured=setting('ADMIN_TOKEN')
    if configured:return configured.strip()
    path=DATA/'admin-token.txt'
    if path.is_file():
        saved=path.read_text(encoding='utf-8').strip()
        if saved:return saved
    print('KAANAM_ADMIN_TOKEN is unset, so a new admin token was saved on this machine. Set that variable on a public host so the token survives a restart.')
    generated=secrets.token_urlsafe(32)
    path.write_text(generated,encoding='utf-8')
    try: path.chmod(0o600)
    except OSError: pass
    return generated
ADMIN=load_admin()
MODEL=ROOT/'models'/'sound_model.joblib'

def now():return datetime.now(timezone.utc)
def stamp(t=None):return (t or now()).isoformat(timespec='seconds')
def parse_time(value):
    """Read a stored time. Values without a timezone are treated as UTC, so a bad row cannot crash the request."""
    text=str(value).strip().replace('Z','+00:00')
    parsed=datetime.fromisoformat(text)
    if parsed.tzinfo is None:parsed=parsed.replace(tzinfo=timezone.utc)
    return parsed
def digest(t):return hashlib.sha256(t.encode()).hexdigest()
def db():
    return open_db(DB)

def init():
    init_schema(DB)
    if DEMO:seed_demo();align_demo_clock()

def seed_demo():
    import random
    r=random.Random(42)
    devices=[('demo-campus','Campus entrance','Chennai · Campus gate',.50),('demo-library','Library zone','Chennai · Study block',.25),('demo-road','Roadside node','Chennai · Main road',.66)]
    start=now().replace(second=0,microsecond=0)-timedelta(hours=6)
    with db() as c:
        if c.execute("SELECT 1 FROM devices WHERE demo=1").fetchone():return
        threshold=c.execute('SELECT threshold FROM settings').fetchone()[0]
        for did,name,location,base in devices:
            c.execute('INSERT INTO devices(id,name,location,token_hash,demo) VALUES(?,?,?,?,1)',(did,name,location,digest(secrets.token_urlsafe(32))))
            for i in range(361):
                level=round(max(.05,min(.98,base+.09*math.sin(i/23)+r.gauss(0,.045)+(.20 if i%61<5 else 0))),4)
                label='Traffic' if did=='demo-road' else r.choice(['Human activity','Construction','Traffic']) if did=='demo-campus' else 'Ambient'
                ts=stamp(start+timedelta(minutes=i)); mid=f'seed-{i}'
                cur=c.execute('INSERT INTO observations(device_id,message_id,timestamp,level,label,flags,calibration) VALUES(?,?,?,?,?,?,?)',(did,mid,ts,level,label,'[]','synthetic'))
                if level>=threshold and i%15==0:c.execute('INSERT INTO alerts(observation_id,device_id,timestamp,level) VALUES(?,?,?,?)',(cur.lastrowid,did,ts,level))

def align_demo_clock():
    """Keep the practice trace inside the default six-hour view. Live rows are left where they are."""
    if not DEMO:return
    with db() as c:
        latest_row=c.execute('SELECT MAX(o.timestamp) AS ts FROM observations o JOIN devices d ON d.id=o.device_id WHERE d.demo=1').fetchone()
        if not latest_row or not latest_row['ts']:return
        try:latest=parse_time(latest_row['ts'])
        except ValueError:return
        delta=now().replace(second=0,microsecond=0)-latest
        if delta.total_seconds()<30*60:return
        observations=c.execute('SELECT o.id,o.timestamp FROM observations o JOIN devices d ON d.id=o.device_id WHERE d.demo=1').fetchall()
        for row in observations:
            try:shifted=stamp(parse_time(row['timestamp'])+delta)
            except ValueError:continue
            c.execute('UPDATE observations SET timestamp=? WHERE id=?',(shifted,row['id']))
        alerts=c.execute('SELECT a.id,a.timestamp FROM alerts a JOIN devices d ON d.id=a.device_id WHERE d.demo=1').fetchall()
        for row in alerts:
            try:shifted=stamp(parse_time(row['timestamp'])+delta)
            except ValueError:continue
            c.execute('UPDATE alerts SET timestamp=? WHERE id=?',(shifted,row['id']))

@asynccontextmanager
async def lifespan(app):
    init();yield
app=FastAPI(title='Kaanam • Environmental Noise Intelligence',version='1.0.0',lifespan=lifespan)

def admin(x_admin_token:str=Header(default='')):
    # Hash both values so the comparison is always the same length (avoids 500s on a wrong-length token).
    if not secrets.compare_digest(digest(x_admin_token or ''),digest(ADMIN)):
        raise HTTPException(401,'Admin token required. See data/admin-token.txt or KAANAM_ADMIN_TOKEN.')

class DeviceIn(BaseModel):
    model_config=ConfigDict(extra='forbid')
    id:str=Field(pattern=r'^[a-zA-Z0-9_-]{3,48}$')
    name:str=Field(min_length=1,max_length=80)
    location:str=Field(min_length=1,max_length=100)
class ObservationIn(BaseModel):
    model_config=ConfigDict(extra='forbid')
    device_id:str=Field(min_length=3,max_length=48)
    message_id:str=Field(min_length=1,max_length=100)
    timestamp:datetime
    level_index:float=Field(ge=0,le=1,allow_inf_nan=False)
    quality_flags:list[Literal['clipping','clock_unsynced','wind_suspected','packet_gap']]=Field(default_factory=list,max_length=4)
    calibration_version:Literal['unvalidated']='unvalidated'
class ThresholdIn(BaseModel):
    threshold:float=Field(ge=.1,le=1,allow_inf_nan=False)

@app.get('/api/health')
def health():return dict(status='ok',demo_enabled=DEMO,classifier_trained=MODEL.is_file() or ai_status()['ready'],ai=ai_status(),measurement='unitless RMS-derived index; not dB or LAeq')
@app.get('/api/ai/status')
def ai_state():return ai_status()

@app.post('/api/admin/check',dependencies=[Depends(admin)])
def admin_check():return {'ok':True}
@app.get('/api/devices')
def devices():
    with db() as c:
        rows=c.execute('SELECT d.id,d.name,d.location,d.firmware,d.calibration,d.demo,MAX(o.timestamp) AS last_seen,COUNT(o.id) AS readings FROM devices d LEFT JOIN observations o ON d.id=o.device_id GROUP BY d.id,d.name,d.location,d.firmware,d.calibration,d.demo').fetchall()
    def status(row):
        if row['demo']:return 'demo'
        if not row['last_seen']:return 'offline'
        try:age=(now()-parse_time(row['last_seen'])).total_seconds()
        except ValueError:return 'offline'
        return 'online' if age<180 else 'offline'
    return [dict(row)|{'status':status(row)} for row in rows]
@app.post('/api/devices',dependencies=[Depends(admin)],status_code=201)
def create_device(d:DeviceIn):
    token=secrets.token_urlsafe(32)
    try:
        with db() as c:c.execute('INSERT INTO devices(id,name,location,token_hash) VALUES(?,?,?,?)',(d.id,d.name,d.location,digest(token)))
    except Exception as error:
        if not is_duplicate(error):raise
        raise HTTPException(409,'Device ID already exists.')
    return dict(id=d.id,device_token=token,note='Copy now; this token is only shown once.')
@app.post('/api/observations',status_code=201)
def ingest(o:ObservationIn,x_device_token:str=Header(default='')):
    if not o.timestamp.tzinfo:raise HTTPException(422,'Timestamp must include a UTC offset.')
    if o.timestamp>now()+timedelta(minutes=5):raise HTTPException(422,'Timestamp is too far in the future.')
    if o.timestamp<now()-timedelta(hours=48):raise HTTPException(422,'Timestamp is more than 48 hours old.')
    ts=stamp(o.timestamp.astimezone(timezone.utc))
    with db() as c:
        d=c.execute('SELECT * FROM devices WHERE id=?',(o.device_id,)).fetchone()
        if not d or d['demo'] or not secrets.compare_digest(d['token_hash'],digest(x_device_token)):raise HTTPException(401,'Invalid device token.')
        existing=c.execute('SELECT id FROM observations WHERE device_id=? AND message_id=?',(o.device_id,o.message_id)).fetchone()
        if existing:return JSONResponse(dict(id=existing['id'],duplicate=True),status_code=200)
        cur=c.execute('INSERT INTO observations(device_id,message_id,timestamp,level,label,flags,calibration) VALUES(?,?,?,?,?,?,?)',(o.device_id,o.message_id,ts,o.level_index,'Unclassified',json.dumps(o.quality_flags),o.calibration_version))
        oid=cur.lastrowid
        if not o.quality_flags and o.level_index>=c.execute('SELECT threshold FROM settings').fetchone()[0]:
            c.execute('INSERT INTO alerts(observation_id,device_id,timestamp,level) VALUES(?,?,?,?)',(oid,o.device_id,ts,o.level_index))
    return dict(id=oid,duplicate=False)

def select_rows(device_id,source,hours):
    clauses=['o.timestamp>=?','d.demo=?']; args=[stamp(now()-timedelta(hours=hours)),int(source=='demo')]
    if device_id!='all':clauses.append('o.device_id=?');args.append(device_id)
    with db() as c:
        rows=c.execute('SELECT o.*,d.name AS device_name FROM observations o JOIN devices d ON d.id=o.device_id WHERE '+' AND '.join(clauses)+' ORDER BY o.timestamp,o.id',args).fetchall()
    def flags(value):
        try:parsed=json.loads(value)
        except (TypeError,json.JSONDecodeError):return []
        return parsed if isinstance(parsed,list) else []
    return [dict(v)|{'flags':flags(v['flags'])} for v in rows]
Source=Literal['demo','live']
@app.get('/api/overview')
def overview(device_id:str='all',source:Source='demo',hours:int=Query(6,ge=1,le=168)):
    rows=select_rows(device_id,source,hours);valid=[r for r in rows if not r['flags']]
    with db() as c:threshold=c.execute('SELECT threshold FROM settings').fetchone()[0]
    groups={};classes={}
    for r in rows:
        minute=r['timestamp'][:16]
        if not r['flags']: groups.setdefault(minute,[]).append(r['level'])
        classes[r['label']]=classes.get(r['label'],0)+1
    chart=[dict(timestamp=k+':00+00:00',index=round(sum(v)/len(v),4)) for k,v in groups.items()]
    values=[v['level'] for v in valid]
    return dict(source=source,measurement='Unitless index',threshold=threshold,total=len(rows),valid=len(valid),flagged=len(rows)-len(valid),
       mean=round(sum(values)/len(values),4) if values else None,peak=max(values) if values else None,
       current=chart[-1]['index'] if chart else None,exceedances=sum(v>=threshold for v in values),series=chart,
       classes=[dict(label=k,count=v) for k,v in sorted(classes.items(),key=lambda a:-a[1])],recent=rows[-10:][::-1],generated_at=stamp())
@app.get('/api/forecast')
def predictions(device_id:str,source:Source='demo'):
    if device_id=='all':raise HTTPException(422,'Select one device for forecasting.')
    rows=select_rows(device_id,source,24)
    bins={}
    for r in rows:
        if not r['flags']:bins.setdefault(r['timestamp'][:16],[]).append(r['level'])
    keys=sorted(bins); contiguous=[];prev=None
    for k in keys:
        try:t=parse_time(k)
        except ValueError:contiguous=[];prev=None;continue
        if prev and (t-prev).total_seconds()!=60:contiguous=[]
        contiguous.append(sum(bins[k])/len(bins[k]));prev=t
    result=forecast(contiguous)
    stale=False
    if rows:
        try:stale=(now()-parse_time(rows[-1]['timestamp'])).total_seconds()>180
        except ValueError:stale=True
    result.update(source=source,device_id=device_id,issued_at=stamp(),last_observation=rows[-1]['timestamp'] if rows else None,training_bins=len(contiguous),stale=stale)
    return result
@app.get('/api/alerts')
def alerts(source:Source='demo',device_id:str='all',hours:int=Query(6,ge=1,le=168)):
    query='SELECT a.*,d.name AS device_name FROM alerts a JOIN devices d ON a.device_id=d.id WHERE d.demo=? AND a.timestamp>=?'
    args=[int(source=='demo'),stamp(now()-timedelta(hours=hours))]
    if device_id!='all':query+=' AND d.id=?';args.append(device_id)
    with db() as c:return [dict(r) for r in c.execute(query+' ORDER BY a.timestamp DESC LIMIT 100',args)]
@app.post('/api/alerts/{alert_id}/acknowledge',dependencies=[Depends(admin)])
def acknowledge(alert_id:int):
    with db() as c:
        if not c.execute('UPDATE alerts SET acknowledged=1 WHERE id=?',(alert_id,)).rowcount:raise HTTPException(404,'Alert not found.')
    return {'ok':True}
@app.put('/api/settings',dependencies=[Depends(admin)])
def settings(s:ThresholdIn):
    with db() as c:c.execute('UPDATE settings SET threshold=? WHERE id=1',(s.threshold,))
    return s
@app.post('/api/demo/tick',dependencies=[Depends(admin)])
def tick():
    if not DEMO:raise HTTPException(403,'Demo disabled.')
    with db() as c:
        threshold=c.execute('SELECT threshold FROM settings').fetchone()[0]
        for d in c.execute('SELECT id FROM devices WHERE demo=1').fetchall():
            last_row=c.execute('SELECT level FROM observations WHERE device_id=? ORDER BY timestamp DESC LIMIT 1',(d['id'],)).fetchone()
            if not last_row:continue
            last=last_row['level']
            value=round(max(.05,min(.98,last+(secrets.randbelow(101)-50)/1000)),4)
            cur=c.execute('INSERT INTO observations(device_id,message_id,timestamp,level,label,flags,calibration) VALUES(?,?,?,?,?,?,?)',(d['id'],secrets.token_hex(8),stamp(),value,'Synthetic event','[]','synthetic'))
            if value>=threshold:c.execute('INSERT INTO alerts(observation_id,device_id,timestamp,level) VALUES(?,?,?,?)',(cur.lastrowid,d['id'],stamp(),value))
    return {'ok':True,'source':'synthetic'}
async def analyse_bytes(raw):
    if len(raw)>6*1024*1024:raise HTTPException(413,'Maximum WAV size is 6 MB.')
    try:features,detail=audio_features(raw)
    except (ValueError,OverflowError) as e:raise HTTPException(422,str(e))
    recognition = await run_in_threadpool(classify,features,MODEL) if MODEL.is_file() else await run_in_threadpool(recognise,raw)
    return dict(features=features,**detail,classification=recognition,retention='Audio is processed in memory and not saved.')
@app.post('/api/audio/analyse')
async def analyse(file:UploadFile=File(...)):
    return await analyse_bytes(await file.read(6*1024*1024+1))

@app.post('/api/devices/{device_id}/audio')
async def device_audio(device_id:str,request:Request,message_id:str=Query(min_length=1,max_length=100),x_device_token:str=Header(default='')):
    with db() as c:
        d=c.execute('SELECT * FROM devices WHERE id=?',(device_id,)).fetchone()
        if not d or d['demo'] or not secrets.compare_digest(d['token_hash'],digest(x_device_token)):
            raise HTTPException(401,'Invalid device token.')
        observation=c.execute('SELECT id FROM observations WHERE device_id=? AND message_id=?',(device_id,message_id)).fetchone()
        if not observation:raise HTTPException(404,'Submit the matching observation before its WAV clip.')
        cached=c.execute('SELECT result FROM ai_events WHERE observation_id=?',(observation['id'],)).fetchone()
        if cached:
            try:saved=json.loads(cached['result'])
            except json.JSONDecodeError:saved=None
            if isinstance(saved,dict):return dict(classification=saved,duplicate=True)
    chunks=[];size=0
    async for chunk in request.stream():
        size+=len(chunk)
        if size>6*1024*1024:raise HTTPException(413,'Maximum WAV size is 6 MB.')
        chunks.append(chunk)
    result=await analyse_bytes(b''.join(chunks));recognition=result['classification']
    if not recognition.get('available',True):raise HTTPException(503,recognition['note'])
    with db() as c:
        c.execute('INSERT OR IGNORE INTO ai_events(observation_id,result,analysed_at) VALUES(?,?,?)',
                  (observation['id'],json.dumps(recognition),stamp()))
        c.execute('UPDATE observations SET label=? WHERE id=?',(recognition['label'],observation['id']))
    return dict(classification=recognition,duplicate=False,retention='Raw audio discarded; model output retained.')

@app.get('/api/export.csv')
def export(device_id:str='all',source:Source='demo',hours:int=Query(6,ge=1,le=168)):
    rows=select_rows(device_id,source,hours);s=io.StringIO();w=csv.writer(s)
    w.writerow(['source','device_id','timestamp_utc','level_index_unitless','sound_label','quality_flags','calibration_version'])
    for r in rows:w.writerow([source,r['device_id'],r['timestamp'],r['level'],r['label'],';'.join(str(flag) for flag in r['flags']),r['calibration']])
    return Response(s.getvalue(),media_type='text/csv',headers={'Content-Disposition':'attachment; filename="kaanam-observations.csv"'})

app.mount('/assets',StaticFiles(directory=ROOT/'frontend'),name='assets')
@app.get('/',include_in_schema=False)
def index():return FileResponse(ROOT/'frontend'/'index.html')
