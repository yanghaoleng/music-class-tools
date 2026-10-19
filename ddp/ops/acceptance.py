"""Isolated full-stack acceptance; never creates accounts in production."""
import sys,os,importlib.util,tempfile,threading,urllib.request,urllib.error,http.cookiejar,json,base64
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT))
work=tempfile.TemporaryDirectory(prefix='ddp-acceptance-');os.environ['DDP_DATA']=work.name;os.environ['DDP_ORIGIN']='http://127.0.0.1:8797'
spec=importlib.util.spec_from_file_location('wcal_auth', '/Users/jojo/Documents/ChatGPT/体重日历/server.py');wcal=importlib.util.module_from_spec(spec);sys.modules['wcal_auth']=wcal;spec.loader.exec_module(wcal)
wcal.WeightCalendarHandler.database=wcal.Database(Path(work.name)/'accounts.sqlite3','isolated-acceptance-secret-at-least-32-characters')
wcal.WeightCalendarHandler.production=False;wcal.WeightCalendarHandler.allowed_origin=None;wcal.WeightCalendarHandler.admin_password='isolated-test-admin'
auth=wcal.ThreadingHTTPServer(('127.0.0.1',0),wcal.WeightCalendarHandler);threading.Thread(target=auth.serve_forever,daemon=True).start();os.environ['DDP_AUTH_ORIGIN']='http://127.0.0.1:'+str(auth.server_port)
import server as app
web=app.ThreadingHTTPServer(('127.0.0.1',8797),app.Handler);threading.Thread(target=web.serve_forever,daemon=True).start();jar=http.cookiejar.CookieJar();client=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar));base='http://127.0.0.1:8797/ddp/api'
def call(path,body=None,method=None):
 req=urllib.request.Request(base+path,data=json.dumps(body).encode() if body is not None else None,method=method,headers={'Content-Type':'application/json','Origin':'http://127.0.0.1:8797'})
 try:r=client.open(req,timeout=150)
 except urllib.error.HTTPError as e:r=e
 d=json.load(r)
 if r.status>=400:raise RuntimeError((r.status,d))
 return d
try:
 a=call('/auth/accounts',{'passcode':'5937','phoneLast4':'6081','displayName':'验收账户'});uid=a['account']['userId'];assert 'records' not in a
 s=call('/scores',{'title':'验收旋律','notes':[{'midi':62,'duration':1},{'midi':64,'duration':.5},{'midi':None,'duration':.5}]});assert 'DDP/1' in s['scoreText']
 call('/stars',{'id':'oneill-1','starred':True},'PUT');assert 'oneill-1' in call('/library')['stars']
 call('/auth/sessions',method='DELETE');call('/auth/sessions',{'passcode':'5937','phoneLast4':'6081'});assert call('/auth/me')['account']['userId']==uid
 assert len(call('/library')['scores'])==1
 call('/auth/theme',{'theme':'mint'},'PUT');call('/auth/font',{'fontStyle':'serif'},'PUT');assert call('/auth/me')['account']['theme']=='mint'
 call('/admin/session',{'password':'isolated-test-admin'});assert call('/admin/dashboard')['totals']['scores']==1
 print('PASS: shared account creation/login, identity continuity, collection persistence, pure-text storage, shared appearance, admin gate',flush=True)
 # Make our own simple treble score; no NAS image is sent to this API.
 if os.environ.get('ARK_API_KEY') and os.environ.get('DDP_TEST_AI')=='1':
  from PIL import Image,ImageDraw,ImageFont
  image=Image.new('RGB',(1000,400),'white');d=ImageDraw.Draw(image);font=ImageFont.truetype('/System/Library/Fonts/Supplemental/Arial.ttf',26)
  d.text((45,25),'Test score - Treble clef - C major - 4/4',font=font,fill='black')
  for y in [120,145,170,195,220]:d.line((70,y,930,y),fill='black',width=2)
  musicfont=ImageFont.truetype(str(ROOT.parent/'notetype/public/music.ttf'),130);d.text((90,78),'𝄞',font=musicfont,fill='black')
  for x,y in [(260,157.5),(430,145),(600,132.5),(770,107.5)]:d.ellipse((x-12,y-8,x+12,y+8),fill='black');d.line((x+12,y,x+12,y-73),fill='black',width=3)
  d.line((900,120,900,220),fill='black',width=3)
  import io
  raw=io.BytesIO();image.save(raw,format='PNG');image.save('/tmp/ddp-synthetic-score.png')
  answer=call('/image',{'data':base64.b64encode(raw.getvalue()).decode()});print('AI synthetic test:',answer.get('title'),answer['notes'],flush=True)
 # Browser can use this isolated test account without touching live data.
 (ROOT/'data').mkdir(exist_ok=True);(ROOT/'data'/'acceptance-context.json').write_text(json.dumps({'port':8797,'pin':'5937','phone':'6081'}))
 print('Browser test server ready on 8797 (Ctrl-C to close)',flush=True)
 threading.Event().wait(1800)
finally:web.shutdown();auth.shutdown()
