import os,json,sqlite3,urllib.request,urllib.error,http.cookies,hashlib,secrets,time,threading,subprocess,tempfile,base64,re,math
from pathlib import Path
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from datetime import datetime,timezone,timedelta
ROOT=Path(__file__).parent
DATA=Path(os.environ.get('DDP_DATA',ROOT/'data')); DATA.mkdir(parents=True,exist_ok=True)
AUTH=os.environ.get('DDP_AUTH_ORIGIN','https://wcal.mikeywa.site')
ORIGIN=os.environ.get('DDP_ORIGIN','https://m.mikeywa.site')
NOTE_NAMES=['C','C#','D','Eb','E','F','F#','G','G#','A','Bb','B']
def encode_notes(notes):
 return 'DDP/1\n'+' '.join(('R' if n['midi'] is None else NOTE_NAMES[n['midi']%12]+str(n['midi']//12-1))+':'+str(n['duration']) for n in notes)
def decode_notes(text):
 notes=[]
 for token in text.removeprefix('DDP/1').split():
  if token=='|':continue
  m=re.fullmatch(r'(R|[A-G][#b]?-?\d):([\d.]+)',token)
  if not m:raise ValueError('无效的音符文本')
  pitch,dur=m.groups();midi=None
  if pitch!='R':
   n,a,o=re.fullmatch(r'([A-G])([#b]?)(-?\d)',pitch).groups();midi=(int(o)+1)*12+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[n]+(1 if a=='#' else -1 if a=='b' else 0)
  notes.append({'midi':midi,'duration':float(dur)})
 return notes

def hydrate(score):
 return {**score,'notes':decode_notes(score['scoreText'])} if score.get('scoreText') else score
CATALOG=[hydrate(t) for t in json.loads((ROOT/'catalog.json').read_text())]
SEM=threading.BoundedSemaphore(2)
CLAIM_LOCK=threading.Lock()
def db():
 c=sqlite3.connect(DATA/'ddp.sqlite3',timeout=15); c.row_factory=sqlite3.Row; return c
with db() as c:
 c.executescript('''PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS stars (owner TEXT,tune TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP,PRIMARY KEY(owner,tune));
 CREATE TABLE IF NOT EXISTS scores (id TEXT PRIMARY KEY,owner TEXT,title TEXT,body TEXT,created TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS events (id INTEGER PRIMARY KEY,owner TEXT,event TEXT,day TEXT DEFAULT (date('now','+8 hours')),created TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS usage (owner TEXT,day TEXT,count INTEGER DEFAULT 0,PRIMARY KEY(owner,day));
 CREATE TABLE IF NOT EXISTS profiles (owner TEXT PRIMARY KEY, display_name TEXT,theme TEXT,font TEXT,updated TEXT DEFAULT CURRENT_TIMESTAMP);
 CREATE TABLE IF NOT EXISTS limits (subject TEXT,slot INTEGER,count INTEGER,PRIMARY KEY(subject,slot));
 ''')

def upstream(path,method='GET',body=None,cookie=''):
 headers={'Content-Type':'application/json','Cookie':cookie,'Origin':AUTH}
 req=urllib.request.Request(AUTH+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
 try:r=urllib.request.urlopen(req,timeout=25)
 except urllib.error.HTTPError as e:r=e
 return r.status,json.loads(r.read()),r.headers.get_all('Set-Cookie',[])

def pitch_extract(raw):
 import numpy as np
 with tempfile.TemporaryDirectory(prefix='ddp-') as tmp:
  inp=Path(tmp)/'input'; inp.write_bytes(raw)
  p=subprocess.run(['ffmpeg','-v','error','-protocol_whitelist','file,pipe','-i',str(inp),'-t','31','-ac','1','-ar','8000','-f','f32le','-'],capture_output=True,timeout=35)
  if p.returncode:raise ValueError('无法读取音频，请上传 WAV、MP3、M4A 或 WebM。')
  audio=np.frombuffer(p.stdout,dtype='<f4')
  if len(audio)<2400 or len(audio)>240000:raise ValueError('请使用 0.3–30 秒的音频。')
  out=[]
  for pos in range(0,len(audio)-1024,160):
   a=audio[pos:pos+1024].copy();a-=np.mean(a)
   if np.sqrt(np.mean(a*a))<.008:continue
   a*=np.hanning(len(a)); corr=np.fft.irfft(abs(np.fft.rfft(a,n=2048))**2)[:1024]
   low,high=3,100
   peaks=[i for i in range(low+1,high) if corr[i]>=corr[i-1] and corr[i]>corr[i+1]]
   if not peaks or corr[0]<=0:continue
   peak=max(corr[i] for i in peaks)
   lag=next((i for i in peaks if corr[i]>=peak*.94),peaks[0])
   if corr[lag]/corr[0]<.65:continue
   delta=.5*(corr[lag-1]-corr[lag+1])/(corr[lag-1]-2*corr[lag]+corr[lag+1])
   midi=round(69+12*math.log2(8000/(lag+delta)/440))
   if midi<40 or midi>100:continue
   start=pos/8000
   if out and out[-1]['midi']==midi and start-out[-1]['end']<.065:out[-1]['end']=start+.02
   else:out.append({'midi':midi,'start':start,'end':start+.02})
  out=[n for n in out if n['end']-n['start']>=.07]
  if len(out)<4:raise ValueError('清晰旋律不足，请靠近麦克风，单独哼唱至少四个音。')
  return [{'midi':n['midi'],'duration':max(.125,round((n['end']-n['start'])*2,2))} for n in out[:400]]

def match_notes(notes):
 seq=[n['midi'] for n in notes if n.get('midi') is not None]
 # Matching uses pitch intervals, so hummed octaves and transposition do not change the query.
 query=[(b-a+6)%12-6 for a,b in zip(seq,seq[1:]) if a!=b][:100]
 if len(query)<3:return []
 ranked=[]
 for tune in CATALOG:
  ns=[n['midi'] for n in tune['notes'] if n.get('midi') is not None]
  target=[(b-a+6)%12-6 for a,b in zip(ns,ns[1:]) if a!=b]
  prev=[0]*(len(target)+1)
  for i,q in enumerate(query):
   curr=[i+1]
   for j,t in enumerate(target):curr.append(min(prev[j+1]+1,curr[-1]+1,prev[j]+(0 if q==t else 1)))
   prev=curr
  score=max(0,1-min(prev[1:])/len(query)) if target else 0
  if score>=.4:ranked.append({'id':tune['id'],'title':tune['title'],'similarity':round(score,3)})
 return sorted(ranked,key=lambda x:-x['similarity'])[:5]

class Handler(BaseHTTPRequestHandler):
 def log_message(self,*args):pass
 def send(self,status,obj,cookies=()):
  raw=json.dumps(obj,ensure_ascii=False).encode();self.send_response(status)
  self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff')
  for cookie in cookies:
   # Keep upstream identity authoritative; expose only this app's session on this host.
   if cookie.startswith('wcal_session=') or cookie.startswith('wcal_admin='):
    self.send_header('Set-Cookie',cookie.replace('Path=/;','Path=/ddp/;'))
  self.end_headers();self.wfile.write(raw)
 def cookies(self):return self.headers.get('Cookie','')
 def identity(self):
  status,body,_=upstream('/api/me',cookie=self.cookies())
  if status!=200:raise PermissionError('请先登录，与体重日历使用同一个账户。')
  account=body['account']
  with db() as c:c.execute('INSERT INTO profiles(owner,display_name,theme,font) VALUES(?,?,?,?) ON CONFLICT(owner) DO UPDATE SET display_name=excluded.display_name,theme=excluded.theme,font=excluded.font,updated=CURRENT_TIMESTAMP',(account['userId'],account.get('displayName',''),account.get('theme','rose'),account.get('fontStyle','system')))
  return account
 def event(self,owner,event):
  with db() as c:c.execute('INSERT INTO events(owner,event) VALUES(?,?)',(owner,event))
 def limit(self,subject,maximum=40):
  slot=int(time.time()/60)
  with db() as c:
   c.execute('BEGIN IMMEDIATE');c.execute('DELETE FROM limits WHERE slot<?',(slot-2,));r=c.execute('SELECT count FROM limits WHERE subject=? AND slot=?',(subject,slot)).fetchone()
   if r and r[0]>=maximum:raise ValueError('操作太频繁，请稍后重试。')
   c.execute('INSERT INTO limits VALUES(?,?,1) ON CONFLICT(subject,slot) DO UPDATE SET count=count+1',(subject,slot))
 def body(self):
  size=int(self.headers.get('Content-Length','0'))
  if size<=0 or size>12*1024*1024:raise ValueError('文件过大，请控制在 8 MB 内。')
  return json.loads(self.rfile.read(size))
 def do_GET(self):self.run('GET')
 def do_POST(self):self.run('POST')
 def do_PUT(self):self.run('PUT')
 def do_DELETE(self):self.run('DELETE')
 def run(self,method):
  try:self.route(method)
  except PermissionError as e:self.send(401,{'error':str(e)})
  except (ValueError,KeyError,TypeError,json.JSONDecodeError) as e:self.send(400,{'error':str(e)})
  except (urllib.error.URLError,TimeoutError):self.send(503,{'error':'账户或 AI 服务暂时无法连接，请稍后重试。'})
  except Exception as e:
   print('request failed:',type(e).__name__,flush=True);self.send(500,{'error':'处理失败，请稍后重试。'})
 def route(self,method):
  path=self.path.split('?')[0]
  if not path.startswith('/ddp/api/'):
   if method!='GET':self.send(404,{'error':'页面不存在'});return
   rel=path.removeprefix('/ddp/');f=(ROOT/'dist'/rel).resolve()
   if not f.is_relative_to((ROOT/'dist').resolve()):self.send(404,{});return
   if not f.is_file():f=ROOT/'dist/index.html'
   import mimetypes
   raw=f.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(str(f))[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(raw)));self.send_header('X-Content-Type-Options','nosniff');self.end_headers();self.wfile.write(raw);return
  endpoint=path.removeprefix('/ddp/api')
  if method!='GET':
   origin=self.headers.get('Origin')
   if origin and origin not in (ORIGIN,'http://127.0.0.1:5180','http://127.0.0.1:8796'):raise PermissionError('请求来源不被允许')
  if endpoint=='/health':self.send(200,{'ok':True,'catalog':len(CATALOG),'aiConfigured':bool(os.environ.get('ARK_API_KEY'))});return
  if endpoint=='/catalog':self.send(200,{'tunes':[{**{k:v for k,v in t.items() if k not in ('notes','scoreText')},'notes':t['notes'][:7],'noteCount':len(t['notes']),'summaryOnly':True} for t in CATALOG]});return
  if endpoint.startswith('/tunes/') and method=='GET':
   t=next((t for t in CATALOG if t['id']==endpoint.rsplit('/',1)[1]),None)
   self.send(200,t) if t else self.send(404,{'error':'曲谱不存在'});return
  if endpoint=='/visit' and method=='POST':
   self.limit('visit:'+self.headers.get('X-Real-IP',self.client_address[0]));self.event('guest','visit');self.send(200,{'ok':True});return
  if endpoint.startswith('/auth/'):
   authpath=endpoint.removeprefix('/auth')
   allowed={('GET','/me'),('POST','/sessions'),('DELETE','/sessions'),('POST','/accounts'),('POST','/accounts/check-passcode'),('PUT','/theme'),('PUT','/font'),('PUT','/sound'),('PUT','/display-name'),('PUT','/passcode'),('PUT','/phone-last4'),('GET','/account/security')}
   if (method,authpath) not in allowed:self.send(404,{});return
   self.limit('auth:'+self.headers.get('X-Real-IP',self.client_address[0]),15)
   status,body,cookies=upstream('/api'+authpath,method,self.body() if method in ('POST','PUT') else None,self.cookies())
   if 'account' in body:body={'account':body['account']} # No health records cross this boundary.
   self.send(status,body,cookies);return
  if endpoint.startswith('/admin'):
   if endpoint=='/admin/session' and method=='POST':
    self.limit('admin:'+self.headers.get('X-Real-IP',self.client_address[0]),8);status,body,cookies=upstream('/api/admin/session','POST',self.body(),self.cookies());self.send(status,{'ok':True} if status==200 else body,cookies);return
   status,_,_=upstream('/api/admin/dashboard',cookie=self.cookies())
   if status!=200:raise PermissionError('请输入管理密码')
   with db() as c:
    if method=='DELETE' and endpoint=='/admin/test-data':
     # Explicit cleanup only for our synthetic acceptance-test owner.
     for table in ('stars','scores','events','usage'):c.execute('DELETE FROM '+table+' WHERE owner=?',('acceptance-test',))
    days=[dict(r) for r in c.execute('SELECT day, count(*) total,sum(event="visit") visits,sum(event="audio") audio,sum(event="image") images FROM events GROUP BY day ORDER BY day DESC LIMIT 30')]
    users=[dict(r) for r in c.execute('SELECT p.owner,p.display_name,p.theme,p.font,p.updated,(SELECT count(*) FROM stars s WHERE s.owner=p.owner) count,(SELECT count(*) FROM scores s WHERE s.owner=p.owner) scores FROM profiles p ORDER BY count DESC')]
    totals={'stars':c.execute('SELECT count(*) FROM stars').fetchone()[0],'scores':c.execute('SELECT count(*) FROM scores').fetchone()[0],'visits':c.execute('SELECT count(*) FROM events WHERE event="visit"').fetchone()[0],'users':len(users),'catalog':len(CATALOG)}
   self.send(200,{'totals':totals,'days':days,'users':users});return
  account=self.identity();owner=account['userId']
  if endpoint=='/nas/claim' and method=='POST':
   with CLAIM_LOCK:
    import hmac
    b=self.body();claim_path=DATA/'nas-claim.json'
    if not claim_path.exists():raise ValueError('没有待导入的 NAS 曲谱')
    claim=json.loads(claim_path.read_text())
    if not hmac.compare_digest(hashlib.sha256(str(b.get('token','')).encode()).hexdigest(),claim['hash']):raise PermissionError('导入链接无效')
    if claim.get('owner') and claim['owner']!=owner:raise PermissionError('这批曲谱已绑定另一账户')
    manifest=json.loads((DATA/'nas-manifest.json').read_text());count=0
    with db() as c:
     c.execute('BEGIN IMMEDIATE')
     for item in manifest:
      score={**item,'source':'NAS 个人曲谱 · '+item['relativePath'],'sourceUrl':'','type':'个人谱','key':item.get('key','D'),'meter':item.get('meter','待核对'),'subtitle':'NAS 个人收藏 · '+('本地转录，待校正' if item.get('scoreText') else '待转录'),'difficulty':'待校正','notes':None}
      score.pop('notes',None)
      c.execute('INSERT OR IGNORE INTO scores(id,owner,title,body) VALUES(?,?,?,?)',(score['id'],owner,score['title'],json.dumps(score)))
      c.execute('INSERT OR IGNORE INTO stars(owner,tune) VALUES(?,?)',(owner,score['id']));count+=1
    claim['owner']=owner;claim_path.write_text(json.dumps(claim));self.send(200,{'count':count});return
  if endpoint.startswith('/nas/image/') and method=='GET':
   tid=endpoint.rsplit('/',1)[1]
   with db() as c:r=c.execute('SELECT body FROM scores WHERE id=? AND owner=?',(tid,owner)).fetchone()
   if not r:raise PermissionError('曲谱不存在')
   score=json.loads(r[0]);file=(DATA/'originals'/score['file']).resolve()
   if not file.is_relative_to((DATA/'originals').resolve()):raise PermissionError('文件不存在')
   raw=file.read_bytes();self.send_response(200);self.send_header('Content-Type','image/png' if file.suffix=='.png' else 'image/jpeg');self.send_header('Content-Length',str(len(raw)));self.send_header('Cache-Control','private, no-store');self.end_headers();self.wfile.write(raw);return
  if endpoint=='/library':
   with db() as c:
    if method=='GET':
     self.send(200,{'stars':[r[0] for r in c.execute('SELECT tune FROM stars WHERE owner=?',(owner,))],'scores':[hydrate(json.loads(r[0])) for r in c.execute('SELECT body FROM scores WHERE owner=? ORDER BY created DESC',(owner,))]});return
  if endpoint=='/stars' and method=='PUT':
   b=self.body();tid=str(b['id'])
   with db() as c:
    exists=any(t['id']==tid for t in CATALOG) or c.execute('SELECT 1 FROM scores WHERE owner=? AND id=?',(owner,tid)).fetchone()
    if not exists:raise ValueError('曲谱不存在')
    if b.get('starred'):c.execute('INSERT OR IGNORE INTO stars(owner,tune) VALUES(?,?)',(owner,tid))
    else:c.execute('DELETE FROM stars WHERE owner=? AND tune=?',(owner,tid))
   self.send(200,{'ok':True});return
  if endpoint=='/scores' and method=='POST':
   b=self.body();notes=b.get('notes',[])
   if not isinstance(notes,list) or not 1<=len(notes)<=1000:raise ValueError('请提供 1–1000 个音符')
   for n in notes:
    if n.get('midi') is not None and (type(n['midi']) is not int or not 36<=n['midi']<=100):raise ValueError('音高无效')
    if not isinstance(n.get('duration'),(int,float)) or not math.isfinite(n['duration']) or not .03<=n['duration']<=16:raise ValueError('时值无效')
   score={'id':'p-'+secrets.token_hex(12),'title':str(b.get('title','未命名旋律'))[:100] or '未命名旋律','subtitle':'我的曲谱','type':'自存','key':'D','meter':'自由节拍','scoreText':encode_notes(notes),'source':'个人上传或校正','sourceUrl':'','difficulty':'待校正'}
   with db() as c:c.execute('INSERT INTO scores(id,owner,title,body) VALUES(?,?,?,?)',(score['id'],owner,score['title'],json.dumps(score)));c.execute('INSERT INTO stars(owner,tune) VALUES(?,?)',(owner,score['id']))
   self.event(owner,'save');self.send(201,hydrate(score));return
  if endpoint.startswith('/scores/') and method=='DELETE':
   tid=endpoint.rsplit('/',1)[1]
   with db() as c:c.execute('DELETE FROM scores WHERE owner=? AND id=?',(owner,tid));c.execute('DELETE FROM stars WHERE owner=? AND tune=?',(owner,tid))
   self.send(200,{'ok':True});return
  if endpoint=='/export':
   with db() as c:self.send(200,{'stars':[r[0] for r in c.execute('SELECT tune FROM stars WHERE owner=?',(owner,))],'scores':[hydrate(json.loads(r[0])) for r in c.execute('SELECT body FROM scores WHERE owner=?',(owner,))]})
   return
  if endpoint in ('/audio','/image') and method=='POST':
   self.limit('ai:'+owner,5)
   if not SEM.acquire(blocking=False):self.send(429,{'error':'正在处理其他旋律，请稍后重试。'});return
   try:
    b=self.body();encoded=b.get('data','');raw=base64.b64decode(encoded,validate=True)
    if len(raw)>8*1024*1024:raise ValueError('文件请控制在 8 MB 内')
    day=datetime.now(timezone(timedelta(hours=8))).date().isoformat()
    with db() as c:
     c.execute('BEGIN IMMEDIATE');r=c.execute('SELECT count FROM usage WHERE owner=? AND day=?',(owner,day)).fetchone()
     if r and r[0]>=10:self.send(429,{'error':'用量受限，请明天再试。'});return
     c.execute('INSERT INTO usage VALUES(?,?,1) ON CONFLICT(owner,day) DO UPDATE SET count=count+1',(owner,day))
    if endpoint=='/audio':
     notes=pitch_extract(raw);self.event(owner,'audio');self.send(200,{'notes':notes,'matches':match_notes(notes),'notice':'单声部音高识别初稿；哼唱、节奏与八度需要试听校正。'});return
    key=os.environ.get('ARK_API_KEY')
    if not key:raise ValueError('图片识谱服务尚未配置')
    mime='image/png' if raw.startswith(b'\x89PNG') else 'image/jpeg' if raw.startswith(b'\xff\xd8') else 'image/webp' if raw.startswith(b'RIFF') and raw[8:12]==b'WEBP' else ''
    if not mime:raise ValueError('请上传 PNG、JPG 或 WebP 曲谱图片')
    prompt='识别图片五线谱的主旋律，应用谱号、调号和临时升降号，含休止符。高音谱号五条线从下到上为E4 G4 B4 D5 F5，四间为F4 A4 C5 E5。先按音符头位置逐个核对，不要按文字标题猜测音高。不猜测无法辨认部分。只返回JSON对象：{"title":"标题","notes":[{"midi":62,"duration":1}],"warning":"不确定处"}。midi为整数36-100，休止符用null，duration以四分音符为1，最多400个音符。如果不是曲谱或无法读取，返回notes空数组。'
    payload={'model':os.environ.get('ARK_MODEL','doubao-seed-2-0-mini-260428'),'messages':[{'role':'user','content':[{'type':'text','text':prompt},{'type':'image_url','image_url':{'url':'data:'+mime+';base64,'+encoded}}]}],'temperature':.1,'max_tokens':6500,'thinking':{'type':'disabled'}}
    req=urllib.request.Request('https://ark.cn-beijing.volces.com/api/v3/chat/completions',data=json.dumps(payload).encode(),headers={'Authorization':'Bearer '+key,'Content-Type':'application/json'})
    try:
     with urllib.request.urlopen(req,timeout=100) as r:result=json.load(r)
    except urllib.error.HTTPError as e:
     print('ark status',e.code,flush=True);raise ValueError('图片识谱暂不可用，请稍后重试。')
    content=result['choices'][0]['message']['content'];text=re.sub(r'^```(?:json)?\s*|\s*```$','',content.strip());answer=json.loads(text)
    notes=answer.get('notes',[])
    if not notes:raise ValueError('未读到清晰的五线谱，请裁剪出单行主旋律后重试。')
    if not isinstance(notes,list) or len(notes)>400:raise ValueError('识别内容格式异常，请重试')
    for n in notes:
     if n.get('midi') is not None and (type(n['midi']) is not int or not 36<=n['midi']<=100):raise ValueError('识别音高异常，请重试')
     if not isinstance(n.get('duration'),(int,float)) or not .03<=n['duration']<=16:raise ValueError('识别时值异常，请重试')
    self.event(owner,'image');self.send(200,{'title':str(answer.get('title','图片识谱'))[:100],'notes':notes,'matches':match_notes(notes),'notice':str(answer.get('warning',''))[:500]+' AI 识谱初稿，请试听并校正后保存。'});return
   finally:SEM.release()
  self.send(404,{'error':'接口不存在'})
if __name__=='__main__':ThreadingHTTPServer(('127.0.0.1',int(os.environ.get('PORT',8796))),Handler).serve_forever()
