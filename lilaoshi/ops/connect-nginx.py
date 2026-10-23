"""Connect only this classroom route to the existing music host."""
from pathlib import Path
from datetime import datetime
import shutil
import subprocess

config=Path('/etc/nginx/sites-enabled/m.mikeywa.site')
text=config.read_text()
if 'location ^~ /pianoclass/' in text:
    print('PianoClass route is already connected')
    raise SystemExit(0)
marker='    location / { return 404; }'
if text.count(marker)!=1:
    raise SystemExit('Unexpected Nginx configuration; left unchanged')
backup=Path('/etc/nginx')/('m.mikeywa.site.before-pianoclass-'+datetime.now().strftime('%Y%m%d-%H%M%S')+'.bak')
shutil.copy2(config,backup)
route=(Path(__file__).parent/'nginx-location.conf').read_text()
try:
    config.write_text(text.replace(marker,route+'\n'+marker))
    subprocess.run(['nginx','-t'],check=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
except Exception:
    shutil.copy2(backup,config)
    subprocess.run(['nginx','-t'],check=True)
    subprocess.run(['systemctl','reload','nginx'],check=True)
    raise
print('PianoClass connected; Nginx backup:',backup)
