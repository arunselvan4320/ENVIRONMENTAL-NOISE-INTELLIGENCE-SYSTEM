"""Download a pinned public model, then verify a real local forward pass."""
import json
from pathlib import Path
from huggingface_hub import snapshot_download
from backend.pretrained import MODEL_ID,REVISION,MODEL_DIR,recognise

def setup():
    print('Downloading pretrained AudioSet AST weights (~346 MB); no audio uploads or API key required.',flush=True)
    MODEL_DIR.mkdir(parents=True,exist_ok=True)
    snapshot_download(repo_id=MODEL_ID,revision=REVISION,local_dir=str(MODEL_DIR),
                      allow_patterns=['config.json','preprocessor_config.json','model.safetensors','README.md'])
    import io,wave,numpy as np
    buffer=io.BytesIO();x=(np.sin(2*np.pi*440*np.arange(16000)/16000)*3000).astype('<i2')
    with wave.open(buffer,'wb') as w:w.setnchannels(1);w.setsampwidth(2);w.setframerate(16000);w.writeframes(x.tobytes())
    result=recognise(buffer.getvalue())
    if not result['available']:raise RuntimeError(result['note'])
    (MODEL_DIR/'kaanam-model.json').write_text(json.dumps({'model_id':MODEL_ID,'revision':REVISION,'smoke_test':'real forward pass succeeded; synthetic tone is not an accuracy evaluation'},indent=2))
    print('Model ready. Actual inference succeeded. Top candidate:',result['probabilities'][0]['label'],flush=True)
if __name__=='__main__':setup()
