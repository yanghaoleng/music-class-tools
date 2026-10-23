"""Start an isolated local classroom. Optional provider file is read into memory only."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import runpy
import secrets
import sys

ROOT=Path(__file__).resolve().parents[1]

def read_env(path):
    result={}
    for line in Path(path).read_text().splitlines():
        line=line.strip()
        if not line or line.startswith('#') or '=' not in line: continue
        key,value=line.removeprefix('export ').split('=',1)
        result[key.strip()]=value.strip().strip('\"\'')
    return result

parser=argparse.ArgumentParser()
parser.add_argument('--port',type=int,default=8798)
parser.add_argument('--ai-env',help='Optional existing private file; import only AI provider settings.')
args=parser.parse_args()
runtime=ROOT/'.runtime';runtime.mkdir(exist_ok=True)
config=runtime/'dev-config.json'
if config.exists(): local=json.loads(config.read_text())
else:
    local={'secret':secrets.token_urlsafe(40),'pin':f'{secrets.randbelow(1000000):06d}'}
    fd=os.open(config,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as f: json.dump(local,f)
defaults={'MUSICCLASS_SECRET':local['secret'],'MUSICCLASS_PIN_SHA256':hashlib.sha256(local['pin'].encode()).hexdigest(),
          'MUSICCLASS_DB':str(runtime/'analytics.sqlite3'),'MUSICCLASS_ORIGINS':f'http://127.0.0.1:{args.port},http://localhost:{args.port}'}
if (ROOT/'.env').exists():
    for key,value in read_env(ROOT/'.env').items():
        if value: os.environ.setdefault(key,value)
if args.ai_env:
    settings=read_env(args.ai_env)
    for suffix in ['KEY','BASE','MODEL']:
        for prefix in ['MUSICCLASS_AI_','REFINETASTE_AI_']:
            value=settings.get(prefix+suffix)
            if value:os.environ.setdefault('MUSICCLASS_AI_'+suffix,value);break
for key,value in defaults.items():os.environ.setdefault(key,value)
os.environ['PORT']=str(args.port)
os.environ.setdefault('MUSICCLASS_AI_LABEL','李老师 · 音乐教练')
sys.path.insert(0,str(ROOT/'server'))
print(f"李老师的音乐班：http://127.0.0.1:{args.port}{os.environ.get('MUSICCLASS_BASE','/lilaoshi')}/",flush=True)
print('本地管理访问码保存在 .runtime/dev-config.json，未写入前端。',flush=True)
runpy.run_path(str(ROOT/'server/app.py'),run_name='__main__')
