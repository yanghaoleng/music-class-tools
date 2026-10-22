from pathlib import Path
import datetime
import shutil
import subprocess

config = Path('/etc/nginx/sites-enabled/m.mikeywa.site')
text = config.read_text()
if 'location /xianji/' in text:
    print('Xianji route already connected')
    raise SystemExit(0)
marker = '    location / { return 404; }'
if text.count(marker) != 1:
    raise SystemExit('Unexpected Nginx configuration; left unchanged')
backup = Path('/etc/nginx') / ('m.mikeywa.site.before-xianji-' + datetime.datetime.now().strftime('%Y%m%d-%H%M%S') + '.bak')
shutil.copy2(config, backup)
route = Path('/opt/xianji/current/ops/nginx-location.conf').read_text()
try:
    config.write_text(text.replace(marker, route + '\n' + marker))
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
except Exception:
    shutil.copy2(backup, config)
    subprocess.run(['nginx', '-t'], check=True)
    subprocess.run(['systemctl', 'reload', 'nginx'], check=True)
    raise
print('Xianji connected; Nginx backup:', backup)
