"""Provision a fresh independent site; existing private settings are preserved."""
import hashlib
import json
import os
from pathlib import Path
import secrets
import shlex

target=Path('/etc/pianoclass.env')
if target.exists():
    print('Existing PianoClass environment preserved')
    raise SystemExit(0)
source=Path('/etc/refinetaste.env')
provider={}
for line in source.read_text().splitlines():
    line=line.strip()
    if not line or line.startswith('#') or '=' not in line:continue
    key,value=line.split('=',1)
    if key not in ('REFINETASTE_AI_KEY','REFINETASTE_AI_BASE','REFINETASTE_AI_MODEL'):continue
    parsed=shlex.split(value)
    if parsed:provider[key.removeprefix('REFINETASTE_')]=parsed[0]
if not provider.get('AI_KEY') or not provider.get('AI_MODEL'):
    raise SystemExit('Existing provider configuration is incomplete; no new environment written')
pin=f'{secrets.randbelow(1000000):06d}'
settings={
    'MUSICCLASS_BASE':'/pianoclass',
    'MUSICCLASS_SECRET':secrets.token_urlsafe(48),
    'MUSICCLASS_PIN_SHA256':hashlib.sha256(pin.encode()).hexdigest(),
    'MUSICCLASS_DB':'/var/lib/pianoclass/analytics.sqlite3',
    'MUSICCLASS_ORIGINS':'https://m.mikeywa.site',
    'PORT':'8842',
    'MUSICCLASS_AI_LABEL':'Li teacher music coach',
    **{'MUSICCLASS_'+key:value for key,value in provider.items()},
}
def private_write(file,text):
    fd=os.open(file,os.O_WRONLY|os.O_CREAT|os.O_EXCL,0o600)
    with os.fdopen(fd,'w') as stream:stream.write(text)
private_write('/etc/pianoclass-access.json',json.dumps({'url':'https://m.mikeywa.site/pianoclass/','dashboard':'https://m.mikeywa.site/pianoclass/data/','pin':pin},indent=2)+'\n')
private_write(target,'\n'.join(key+'='+json.dumps(value,ensure_ascii=False) for key,value in settings.items())+'\n')
print('Independent PianoClass configuration ready; private credentials were not printed')
