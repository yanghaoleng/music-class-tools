from pathlib import Path
import shutil,subprocess,datetime
p=Path('/etc/nginx/sites-enabled/m.mikeywa.site')
s=p.read_text();marker='    location / { return 404; }'
if 'location /cal/' not in s:
 if s.count(marker)!=1: raise SystemExit('Unexpected Nginx configuration; no change made')
 backup=Path('/etc/nginx')/('m.mikeywa.site.before-music-cal-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S')+'.bak')
 shutil.copy2(p,backup)
 s=s.replace(marker,Path('/opt/music-cal/current/ops/nginx-location.conf').read_text()+'\n'+marker)
 p.write_text(s)
 result=subprocess.run(['nginx','-t'])
 if result.returncode:
  shutil.copy2(backup,p);raise SystemExit('Nginx check failed; restored backup')
 subprocess.run(['systemctl','reload','nginx'],check=True)
 print('Route connected; backup:',backup)
else: print('Route already present')
