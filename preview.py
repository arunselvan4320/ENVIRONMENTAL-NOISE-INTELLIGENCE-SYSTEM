"""Development preview adapter; the standard launcher is run.py."""
import argparse,uvicorn
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--host',default='127.0.0.1');p.add_argument('--port',type=int,default=4173);p.add_argument('--strictPort',action='store_true');a=p.parse_args()
 uvicorn.run('backend.main:app',host=a.host,port=a.port)
