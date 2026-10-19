"""Synthetic calendar acceptance. Use --local-edge on the production host to test TLS/Nginx over loopback."""
import argparse,datetime,hashlib,http.client,http.cookiejar,json,socket
from pathlib import Path
from urllib.request import Request,build_opener,HTTPCookieProcessor,HTTPSHandler
from urllib.error import HTTPError

parser=argparse.ArgumentParser();parser.add_argument('--local-edge',action='store_true');parser.add_argument('--build',default='dist');args=parser.parse_args()
base='https://m.mikeywa.site/cal/'
class LocalHTTPSConnection(http.client.HTTPSConnection):
 def connect(self):
  if self.host!='m.mikeywa.site': raise ValueError('Unexpected target')
  self.sock=socket.create_connection(('127.0.0.1',443),self.timeout)
  self.sock=self._context.wrap_socket(self.sock,server_hostname=self.host)
class LocalHTTPSHandler(HTTPSHandler):
 def https_open(self,req): return self.do_open(LocalHTTPSConnection,req,context=self._context)
handlers=[HTTPCookieProcessor(http.cookiejar.CookieJar())]
if args.local_edge: handlers.append(LocalHTTPSHandler())
opener=build_opener(*handlers)
def call(path,body=None,expected=200):
 try:
  response=opener.open(Request(base+'api/'+path,data=None if body is None else json.dumps(body).encode(),headers={} if body is None else {'Content-Type':'application/json'}),timeout=20)
  status=response.status;result=json.load(response)
 except HTTPError as e: status=e.code;result=json.load(e)
 assert status==expected,(path,status,result)
 return result
call('demo',{})
d=call('bootstrap');lesson=next(l for l in d['lessons'] if l['date']>d['today'] and l['status']=='scheduled')
destination=str(datetime.date.fromisoformat(lesson['date'])+datetime.timedelta(days=1))
payload={'id':lesson['id'],'date':destination,'time':lesson['time'],'expected_date':lesson['date'],'expected_time':lesson['time']}
call('lessons/move',payload)
after=call('bootstrap');moved=next(l for l in after['lessons'] if l['id']==lesson['id'])
assert moved==dict(lesson,date=destination)
assert after['students']==d['students'] and len(after['lessons'])==len(d['lessons'])
call('lessons/move',dict(payload,time='15:00'),409)
other=next(s for s in d['students'] if s['teacher']==lesson['teacher'] and s['id']!=lesson['student'])
call('lessons',{'teacher':lesson['teacher'],'student':other['id'],'date':destination,'time':'11:00','room':'独立测试琴房'})
conflict=call('lessons/move',dict(payload,time='11:00',expected_date=destination),400)
assert next(l for l in call('bootstrap')['lessons'] if l['id']==lesson['id'])==moved
call('demo-role',{'role':'student'})
call('lessons/move',dict(payload,time='15:00',expected_date=destination),403)
root=Path(args.build);hashes={}
for file in [root/'index.html',*sorted((root/'assets').glob('*.js')),*sorted((root/'assets').glob('*.css'))]:
 response=opener.open(base+('' if file.name=='index.html' else 'assets/'+file.name),timeout=20).read()
 assert hashlib.sha256(response).digest()==hashlib.sha256(file.read_bytes()).digest(),file.name
 hashes[file.name]=hashlib.sha256(response).hexdigest()
print(json.dumps({'checked_at':datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8))).isoformat(),'transport':'verified TLS and Nginx via host loopback' if args.local_edge else 'public HTTPS','same_lesson_moved':True,'metadata_and_credits_unchanged':True,'stale_move_http':409,'conflict_http':400,'conflict_message':conflict['error'],'conflict_keeps_original_position':True,'student_move_http':403,'all_live_build_assets_match':True,'asset_hashes':hashes,'scope':'independent synthetic demo workspace only'},ensure_ascii=False,indent=2))
