import io,os,tempfile,unittest,wave
from pathlib import Path
from datetime import datetime,timezone,timedelta
os.environ.pop('DATABASE_URL', None)
os.environ.pop('KAANAM_DATABASE_URL', None)
os.environ['KAANAM_DATA_DIR']=tempfile.mkdtemp(prefix='kaanam-tests-')
os.environ['KAANAM_ADMIN_TOKEN']='test-admin-token'
os.environ['KAANAM_DEMO']='1'
import numpy as np
from fastapi.testclient import TestClient
from backend.main import app
from backend.analytics import forecast
class SystemTests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):cls.ctx=TestClient(app);cls.c=cls.ctx.__enter__();cls.admin={'X-Admin-Token':'test-admin-token'}
 @classmethod
 def tearDownClass(cls):cls.ctx.__exit__(None,None,None)
 def register(self,name):
  r=self.c.post('/api/devices',json={'id':name,'name':'Test sensor','location':'Bench'},headers=self.admin);self.assertEqual(r.status_code,201);return r.json()['device_token']
 def payload(self,did,level=.8):return {'device_id':did,'message_id':'test-1','timestamp':datetime.now(timezone.utc).isoformat(),'level_index':level}
 def test_demo_separation(self):
  d=self.c.get('/api/overview').json();self.assertEqual(d['source'],'demo');self.assertGreater(d['total'],0)
  d=self.c.get('/api/overview?source=live').json();self.assertTrue(all(r['calibration']!='synthetic' for r in d['recent']))
 def test_auth(self):
  self.assertEqual(self.c.post('/api/devices',json={'id':'blocked','name':'x','location':'x'}).status_code,401)
  self.assertEqual(self.c.post('/api/devices',json={'id':'short-token','name':'x','location':'x'},headers={'X-Admin-Token':'x'}).status_code,401)
  t=self.register('auth-test');p=self.payload('auth-test');self.assertEqual(self.c.post('/api/observations',json=p).status_code,401)
  self.assertEqual(self.c.post('/api/observations',json=p,headers={'X-Device-Token':t}).status_code,201)
 def test_dedup_and_ack(self):
  t=self.register('dedup-test');p=self.payload('dedup-test');h={'X-Device-Token':t}
  a=self.c.post('/api/observations',json=p,headers=h);b=self.c.post('/api/observations',json=p,headers=h);self.assertEqual(a.status_code,201);self.assertEqual(b.status_code,200);self.assertEqual(a.json()['id'],b.json()['id']);self.assertTrue(b.json()['duplicate'])
  alerts=self.c.get('/api/alerts?source=live&device_id=dedup-test').json();self.assertEqual(len(alerts),1)
  self.assertEqual(self.c.post(f"/api/alerts/{alerts[0]['id']}/acknowledge").status_code,401)
  self.assertEqual(self.c.post(f"/api/alerts/{alerts[0]['id']}/acknowledge",headers=self.admin).status_code,200)
 def test_invalid_measurements(self):
  t=self.register('invalid-test');p=self.payload('invalid-test',2);h={'X-Device-Token':t};self.assertEqual(self.c.post('/api/observations',json=p,headers=h).status_code,422)
  p=self.payload('invalid-test');p['timestamp']='2026-01-01T00:00:00';self.assertEqual(self.c.post('/api/observations',json=p,headers=h).status_code,422)
  p['timestamp']=(datetime.now(timezone.utc)+timedelta(days=2)).isoformat();self.assertEqual(self.c.post('/api/observations',json=p,headers=h).status_code,422)
  p['timestamp']=(datetime.now(timezone.utc)-timedelta(days=3)).isoformat();self.assertEqual(self.c.post('/api/observations',json=p,headers=h).status_code,422)
 def test_quality(self):
  t=self.register('quality-test');p=self.payload('quality-test');p['quality_flags']=['clipping'];self.c.post('/api/observations',json=p,headers={'X-Device-Token':t})
  d=self.c.get('/api/overview?source=live&device_id=quality-test').json();self.assertEqual(d['valid'],0);self.assertEqual(d['flagged'],1)
  self.assertEqual(self.c.get('/api/alerts?source=live&device_id=quality-test').json(),[])
 def test_forecast(self):
  d=self.c.get('/api/forecast?device_id=demo-road').json();self.assertTrue(d['available']);self.assertEqual(len(d['points']),6);self.assertEqual(len(d['metrics']),4);self.assertTrue(d['ai_evaluated'])
  self.assertFalse(forecast([.1]*5)['available']);self.assertEqual(forecast([.4]*50)['metrics'][0]['mae'],0)
  short=forecast([.2]*20);self.assertTrue(short['available']);self.assertEqual([m['model'] for m in short['metrics']],['Persistence','Moving average','Linear trend']);self.assertFalse(short['ai_evaluated'])
  import sqlite3
  from backend.main import DB
  con=sqlite3.connect(DB)
  con.execute("UPDATE devices SET demo=0 WHERE id='demo-library'")
  con.execute("UPDATE observations SET timestamp='2026-01-01 00:00:00' WHERE device_id='demo-library'")
  con.commit();con.close()
  self.assertEqual(self.c.get('/api/devices').status_code,200)
  self.assertEqual(self.c.get('/api/forecast?device_id=demo-library&source=live').status_code,200)
 def test_audio(self):
  b=io.BytesIO();rate=16000;x=(np.sin(2*np.pi*1000*np.arange(rate)/rate)*10000).astype('<i2')
  with wave.open(b,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(x.tobytes())
  r=self.c.post('/api/audio/analyse',files={'file':('test.wav',b.getvalue(),'audio/wav')});self.assertEqual(r.status_code,200);d=r.json()
  self.assertAlmostEqual(d['features']['centroid'],1000,delta=50);self.assertIn('model_version',d['classification']);self.assertTrue(d['spectrogram'])
  self.assertEqual(self.c.post('/api/audio/analyse',files={'file':('bad.wav',b'not audio')}).status_code,422)
 def test_frontend_export(self):
  self.assertEqual(self.c.get('/').status_code,200);self.assertIn('Kaanam',self.c.get('/').text)
  r=self.c.get('/api/export.csv');self.assertEqual(r.status_code,200);self.assertIn('level_index_unitless',r.text);self.assertIn('demo,',r.text)
  self.assertEqual(self.c.get('/api/alerts?hours=1').status_code,200)
  self.assertEqual(self.c.get('/assets/style.css').status_code,200)
 def test_ai_status_and_device_audio(self):
  from unittest.mock import patch
  info=self.c.get('/api/ai/status').json();self.assertIn('weights_available',info);self.assertIn('revision',info)
  token=self.register('audio-node');p=self.payload('audio-node');h={'X-Device-Token':token}
  self.c.post('/api/observations',json=p,headers=h)
  b=io.BytesIO()
  with wave.open(b,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(np.zeros(16000,dtype='<i2').tobytes())
  endpoint='/api/devices/audio-node/audio?message_id=test-1'
  self.assertEqual(self.c.post(endpoint,content=b.getvalue()).status_code,401)
  result={'label':'Test label','confidence':.8,'model_version':'test-double','probabilities':[],'available':True,'note':'test fixture'}
  with patch('backend.main.recognise',return_value=result):
   r=self.c.post(endpoint,content=b.getvalue(),headers=h);self.assertEqual(r.status_code,200)
  self.assertTrue(self.c.post(endpoint,content=b.getvalue(),headers=h).json()['duplicate'])
  rows=self.c.get('/api/overview?source=live&device_id=audio-node').json()['recent'];self.assertEqual(rows[0]['label'],'Test label')
 def test_uncertain_when_top_score_is_low(self):
  import torch
  from unittest.mock import patch
  import backend.pretrained as pretrained
  class FakeModel:
   class config:
    id2label={0:'Alpha',1:'Beta',2:'Gamma',3:'Delta'}
   def __call__(self,**kwargs):
    class Out:
     logits=torch.tensor([[-8.0,-8.0,-8.0,-8.0]])
    return Out()
  class FakeExtractor:
   def __call__(self,*args,**kwargs):return {}
  saved=(pretrained._model,pretrained._extractor,pretrained._error)
  def fake_load():
   pretrained._model=FakeModel();pretrained._extractor=FakeExtractor();pretrained._error=None
  try:
   with patch.object(pretrained,'_load',fake_load):
    body=pretrained.recognise(self._tone())
  finally:
   pretrained._model,pretrained._extractor,pretrained._error=saved
  self.assertEqual(body['label'],'Unknown / uncertain')
  self.assertLess(body['confidence'],0.35)
  self.assertTrue(body['probabilities'])
  self.assertTrue(body['available'])
 def test_missing_weights_are_unavailable(self):
  import backend.pretrained as pretrained
  from unittest.mock import patch
  empty=Path(tempfile.mkdtemp(prefix='kaanam-no-weights-'))
  with patch.object(pretrained,'MODEL_DIR',empty):
   result=pretrained.recognise(b'unused')
  self.assertFalse(result['available'])
  self.assertIsNone(result['confidence'])
  self.assertEqual(result['probabilities'],[])
  self.assertEqual(result['label'],'AI model not installed')
 def test_optional_classifier_replaces_transformer(self):
  import joblib
  from sklearn.ensemble import RandomForestClassifier
  from unittest.mock import patch
  from backend.analytics import FEATURES
  clf=RandomForestClassifier(n_estimators=8,random_state=0)
  clf.fit([[0.1]*7,[0.9]*7],['Quiet','Loud'])
  path=Path(tempfile.mkdtemp(prefix='kaanam-joblib-'))/'sound_model.joblib'
  joblib.dump({'model':clf,'version':'qa-optional'},path)
  with patch('backend.main.MODEL',path):
   body=self.c.post('/api/audio/analyse',files={'file':('tone.wav',self._tone(),'audio/wav')}).json()['classification']
  self.assertIn('Optional local classifier',body['note'])
  self.assertEqual(body['model_version'],'qa-optional')
  self.assertTrue(body['probabilities'])
 def _tone(self):
  buf=io.BytesIO();rate=16000;x=(np.sin(2*np.pi*1000*np.arange(rate)/rate)*10000).astype('<i2')
  with wave.open(buf,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(rate);w.writeframes(x.tobytes())
  return buf.getvalue()
if __name__=='__main__':unittest.main(verbosity=2)
