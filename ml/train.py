"""Run from project root: python -m ml.train recordings.csv (path,label,group)."""
import argparse,csv,json
from pathlib import Path
import joblib,numpy as np
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import classification_report,confusion_matrix,balanced_accuracy_score
from sklearn.model_selection import GroupShuffleSplit
from backend.analytics import FEATURES,audio_features

def train(csv_path):
 root=Path(csv_path).resolve().parent
 with open(csv_path,newline='',encoding='utf-8-sig') as f:rows=list(csv.DictReader(f))
 if not rows or not {'path','label','group'}.issubset(rows[0]):raise ValueError('CSV needs path,label,group columns.')
 if len({r['group'] for r in rows})<5:raise ValueError('Supply at least 5 independent groups; more are recommended.')
 X=[];labels=[];groups=[]
 for r in rows:
  features,_=audio_features((root/r['path']).read_bytes());X.append([features[k] for k in FEATURES]);labels.append(r['label']);groups.append(r['group'])
 X=np.asarray(X);y=np.asarray(labels);g=np.asarray(groups)
 tr,te=next(GroupShuffleSplit(n_splits=1,test_size=.25,random_state=42).split(X,y,g))
 if set(y[tr])!=set(y[te]):raise ValueError('Each class must occur in both group-disjoint splits. Add independent sessions per class.')
 if len(set(y))<2:raise ValueError('At least two sound classes required.')
 clf=RandomForestClassifier(n_estimators=250,class_weight='balanced',random_state=42,n_jobs=-1)
 clf.fit(X[tr],y[tr]);pred=clf.predict(X[te]);classes=clf.classes_.tolist();majority=max(set(y[tr]),key=list(y[tr]).count)
 metrics={'split':'group-disjoint 75/25, seed 42','features':FEATURES,'train_samples':len(tr),'test_samples':len(te),'train_groups':sorted(set(g[tr])),'test_groups':sorted(set(g[te])),
 'classification_report':classification_report(y[te],pred,output_dict=True,zero_division=0),'balanced_accuracy':balanced_accuracy_score(y[te],pred),
 'majority_baseline_accuracy':float(np.mean(y[te]==majority)),'classes':classes,'confusion_matrix':confusion_matrix(y[te],pred,labels=classes).tolist(),
 'limitations':'Summary-feature baseline. Not field validated; probabilities uncalibrated. No hyperparameter selection on test set.'}
 Path('models').mkdir(exist_ok=True);joblib.dump({'model':clf,'features':FEATURES,'version':'rf-signal-v1'},'models/sound_model.joblib')
 Path('models/evaluation.json').write_text(json.dumps(metrics,indent=2,default=lambda v:v.item()));print(json.dumps(metrics,indent=2,default=lambda v:v.item()))
if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('csv_path');train(parser.parse_args().csv_path)
