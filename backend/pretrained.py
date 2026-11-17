"""Local AudioSet transformer inference. No user audio is sent to a remote API."""
import importlib.util, io, math, os, threading, wave
from pathlib import Path
import numpy as np
from scipy.signal import resample_poly

MODEL_ID='MIT/ast-finetuned-audioset-10-10-0.4593'
REVISION='f826b80d28226b62986cc218e5cec390b1096902'
def _setting(name, default=None):
    value=os.getenv('KAANAM_'+name)
    if value is None:value=os.getenv('NOISE_'+name)
    return default if value is None else value
MODEL_DIR=Path(_setting('AST_MODEL_DIR',Path(__file__).resolve().parent.parent/'models'/'ast'))
_lock=threading.Lock()
_model=None
_extractor=None
_error=None

def status():
    installed=all(importlib.util.find_spec(m) is not None for m in ('torch','transformers','safetensors'))
    files=all((MODEL_DIR/f).is_file() for f in ('config.json','preprocessor_config.json','model.safetensors'))
    return dict(engine='Audio Spectrogram Transformer',model_id=MODEL_ID,revision=REVISION,
                dependencies_installed=installed,weights_available=files,loaded=_model is not None,
                ready=installed and files and _error is None,last_error=_error,
                setup='Run python -m pip install -r requirements-ai.txt, then python -m ml.setup_pretrained.')

def _load():
    global _model,_extractor,_error
    if _model is not None:return
    # A progress bar writes to the console. On Windows that write can raise
    # OSError 22 when the server has no console, and the model would then look unavailable.
    os.environ['HF_HUB_DISABLE_PROGRESS_BARS']='1'
    os.environ['TQDM_DISABLE']='1'
    import torch
    from transformers import AutoFeatureExtractor,AutoModelForAudioClassification
    from transformers.utils import logging as hf_logging
    hf_logging.disable_progress_bar()
    try:torch.set_num_threads(max(1,int(_setting('AI_THREADS','2'))))
    except (OSError,ValueError):pass
    _extractor=AutoFeatureExtractor.from_pretrained(str(MODEL_DIR),local_files_only=True,trust_remote_code=False)
    _model=AutoModelForAudioClassification.from_pretrained(str(MODEL_DIR),local_files_only=True,trust_remote_code=False,use_safetensors=True)
    _model.eval();_error=None

def recognise(raw):
    global _error
    info=status()
    if not info['dependencies_installed'] or not info['weights_available']:
        return dict(label='AI model not installed',confidence=None,model_version='ast-unavailable',probabilities=[],available=False,
                    note=info['setup'])
    with _lock:
        try:
            _load()
            import torch
            with wave.open(io.BytesIO(raw)) as w:
                rate=w.getframerate();channels=w.getnchannels()
                x=np.frombuffer(w.readframes(w.getnframes()),dtype='<i2').astype(np.float32)/32768
            x=x.reshape(-1,channels).mean(axis=1)
            divisor=math.gcd(rate,16000)
            if rate!=16000:x=resample_poly(x,16000//divisor,rate//divisor).astype(np.float32)
            # Evaluate every ten-second window; preserve events from any window.
            scores=[]
            with torch.inference_mode():
                for start in range(0,len(x),160000):
                    chunk=x[start:start+160000]
                    if len(chunk)==0:continue
                    inputs=_extractor(chunk,sampling_rate=16000,return_tensors='pt')
                    scores.append(torch.sigmoid(_model(**inputs).logits[0]).cpu().numpy())
            if not scores:
                raise ValueError('Audio was too short to analyse.')
            score=np.max(scores,axis=0);order=np.argsort(score)[-5:][::-1]
            candidates=[dict(label=_model.config.id2label[int(i)],probability=float(score[i])) for i in order]
            top=candidates[0]
            _error=None
            return dict(label=top['label'] if top['probability']>=.35 else 'Unknown / uncertain',confidence=top['probability'],
                        model_version=MODEL_ID+'@'+REVISION[:8],probabilities=candidates,available=True,
                        windows_analysed=len(scores),note='Pretrained AudioSet model. Independent sigmoid scores may overlap and do not sum to 100%. Threshold 0.35 is exploratory; field accuracy is unverified.')
        except Exception as exc:
            _error=f'{type(exc).__name__}: {exc}'
            return dict(label='AI model unavailable',confidence=None,model_version='ast-error',probabilities=[],available=False,
                        note='Local inference failed. Check /api/ai/status and server dependencies. No sound label was invented.')
