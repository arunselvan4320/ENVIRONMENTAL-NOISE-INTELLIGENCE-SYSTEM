"""Signal features and causal baseline forecasts. No fabricated AI scores."""
import io
import wave
from pathlib import Path
import numpy as np
from scipy.signal import stft
from sklearn.ensemble import RandomForestRegressor

FEATURES = ['rms', 'zcr', 'centroid', 'rolloff', 'low_ratio', 'mid_ratio', 'high_ratio']

def audio_features(raw):
    try:
        with wave.open(io.BytesIO(raw)) as w:
            rate, channels, width, frames = w.getframerate(), w.getnchannels(), w.getsampwidth(), w.getnframes()
            if width != 2 or w.getcomptype() != 'NONE':
                raise ValueError('Use an uncompressed 16-bit PCM WAV file.')
            if not 8000 <= rate <= 96000 or not 1 <= channels <= 2:
                raise ValueError('Use mono/stereo WAV at 8–96 kHz.')
            if frames / rate > 30 or frames / rate < .1:
                raise ValueError('Audio duration must be between 0.1 and 30 seconds.')
            x = np.frombuffer(w.readframes(frames), dtype='<i2').astype(float) / 32768
    except (wave.Error, EOFError) as e:
        raise ValueError('Cannot decode this WAV file. Export as 16-bit PCM WAV.') from e
    if len(x) != frames * channels:
        raise ValueError('Incomplete WAV data.')
    x = x.reshape(-1, channels).mean(axis=1)
    rms = float(np.sqrt(np.mean(x*x)))
    freqs, times, spec = stft(x, fs=rate, nperseg=min(512,len(x)), noverlap=min(256,len(x)//2))
    power = abs(spec)**2
    energy = power.mean(axis=1)
    total = float(energy.sum()) + 1e-20
    centroid = float(np.sum(freqs*energy)/total)
    rolloff = float(freqs[min(len(freqs)-1, np.searchsorted(np.cumsum(energy), total*.85))])
    f = dict(rms=rms,zcr=float(np.mean(np.diff(np.signbit(x))!=0)),centroid=centroid,rolloff=rolloff,
             low_ratio=float(energy[freqs<500].sum()/total),mid_ratio=float(energy[(freqs>=500)&(freqs<2000)].sum()/total),high_ratio=float(energy[freqs>=2000].sum()/total))
    matrix = 10*np.log10(power+1e-12)
    # Fixed shape for small browser spectrograms; values are signal dBFS-like power, never SPL.
    ti = np.linspace(0,matrix.shape[1]-1,min(120,matrix.shape[1])).astype(int)
    fi = np.linspace(0,matrix.shape[0]-1,min(96,matrix.shape[0])).astype(int)
    waveform = x[np.linspace(0,len(x)-1,min(300,len(x))).astype(int)]
    return f, dict(duration=round(frames/rate,2),sample_rate=rate,clipping=bool(np.max(abs(x))>.995),
        dbfs=round(20*np.log10(max(rms,1e-12)),2),waveform=np.round(waveform,4).tolist(),spectrogram=np.round(matrix[np.ix_(fi,ti)],1).tolist())

def classify(features, model_path):
    if not Path(model_path).is_file():
        return dict(label='Unclassified',confidence=None,model_version='not-trained',probabilities=[],
                    note='No trained model installed. Signal analysis is real; sound labels require training.')
    try:
        import joblib
        bundle = joblib.load(model_path)  # Only load trusted local training artifacts.
        probs = bundle['model'].predict_proba([[features[k] for k in FEATURES]])[0]
        pairs = sorted(zip(bundle['model'].classes_,probs), key=lambda p:-p[1])
        return dict(label=str(pairs[0][0]) if pairs[0][1]>=.55 else 'Unknown / uncertain',confidence=float(pairs[0][1]),
            model_version=bundle['version'],probabilities=[dict(label=str(k),probability=float(v)) for k,v in pairs],
            note='Optional local classifier is in use instead of the Audio Spectrogram Transformer. Its probabilities are uncalibrated.')
    except Exception:
        return dict(label='AI model unavailable',confidence=None,model_version='model-error',probabilities=[],available=False,
                    note='The local model file could not be read. No sound label was invented.')

def clip_level(value, fallback):
    number=float(value)
    if not np.isfinite(number):return float(fallback)
    return float(np.clip(number,0,1))

def forecast(values, steps=6):
    a=np.array(values,dtype=float)
    if len(a)<12:
        return dict(available=False,note='At least 12 valid one-minute bins are needed.',points=[],metrics=[])
    # Rolling-origin one-step evaluation. Each prediction sees only its past.
    use_rf=len(a)>=40
    names=['Persistence','Moving average','Linear trend']+(['Random Forest AI'] if use_rf else [])
    errors={k:[] for k in names}
    start=max(24 if use_rf else 8,len(a)-20)
    def fit_rf(past):
        X=np.array([past[j-6:j] for j in range(6,len(past))]);y=past[6:]
        model=RandomForestRegressor(n_estimators=32,max_depth=5,min_samples_leaf=2,random_state=42,n_jobs=1)
        return model.fit(X,y)
    for i in range(start,len(a)):
        past=a[:i]; window=past[-12:]
        pred={'Persistence':past[-1],'Moving average':past[-6:].mean(),
              'Linear trend':np.clip(np.polyval(np.polyfit(np.arange(len(window)),window,1),len(window)),0,1)}
        if use_rf:pred['Random Forest AI']=clip_level(fit_rf(past).predict([past[-6:]])[0], past[-1])
        for k,v in pred.items():errors[k].append(float(v-a[i]))
    metrics=[dict(model=k,mae=float(np.mean(np.abs(v))),rmse=float(np.sqrt(np.mean(np.square(v)))),n=len(v)) for k,v in errors.items()]
    best=min(metrics,key=lambda v:v['mae'])['model']
    window=a[-12:]; slope,intercept=np.polyfit(np.arange(len(window)),window,1)
    points=[]
    rf=fit_rf(a) if best=='Random Forest AI' else None
    recursive=list(a[-6:])
    for j in range(1,steps+1):
        p=a[-1] if best=='Persistence' else a[-6:].mean() if best=='Moving average' else np.clip(intercept+slope*(len(window)-1+j),0,1)
        if rf is not None:
            p=clip_level(rf.predict([recursive[-6:]])[0], recursive[-1]);recursive.append(p)
        points.append(dict(minutes=j,index=round(float(p),4)))
    return dict(available=True,ai_evaluated=use_rf,selected_model=best,points=points,metrics=metrics,
        note='One-minute rolling-origin validation; errors are unitless. Multi-step forecasts are exploratory; no confidence interval claimed.')
