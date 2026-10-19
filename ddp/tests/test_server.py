import unittest,sys,os,tempfile,threading,json,urllib.request,urllib.error,io,wave,math,struct
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]));tmp=tempfile.TemporaryDirectory();os.environ['DDP_DATA']=tmp.name
import server as app
class Tests(unittest.TestCase):
 @classmethod
 def setUpClass(cls):
  cls.s=app.ThreadingHTTPServer(('127.0.0.1',0),app.Handler);threading.Thread(target=cls.s.serve_forever,daemon=True).start();cls.base='http://127.0.0.1:'+str(cls.s.server_port)+'/ddp/api'
 @classmethod
 def tearDownClass(cls):cls.s.shutdown();cls.s.server_close()
 def request(self,p,body=None,method=None,origin='http://127.0.0.1:8796'):
  req=urllib.request.Request(self.base+p,data=json.dumps(body).encode() if body else None,method=method,headers={'Content-Type':'application/json','Origin':origin})
  try:r=urllib.request.urlopen(req)
  except urllib.error.HTTPError as e:r=e
  return r.status,json.load(r)
 def test_guest_cannot_read_library(self):
  with patch.object(app,'upstream',return_value=(401,{},[])):self.assertEqual(self.request('/library')[0],401)
 def test_owner_isolation_and_text_storage(self):
  with patch.object(app.Handler,'identity',return_value={'userId':'alice'}):
   status,score=self.request('/scores',{'title':'test','notes':[{'midi':62,'duration':1}]});self.assertEqual(status,201);tid=score['id']
   self.assertEqual(len(self.request('/library')[1]['scores']),1)
   with app.db() as c:
    body=json.loads(c.execute('SELECT body FROM scores WHERE id=?',(tid,)).fetchone()[0]);self.assertIn('scoreText',body);self.assertNotIn('notes',body)
  with patch.object(app.Handler,'identity',return_value={'userId':'bob'}):
   self.assertEqual(self.request('/library')[1]['scores'],[]);self.request('/scores/'+tid,method='DELETE')
   self.assertEqual(self.request('/stars',{'id':tid,'starred':True},'PUT')[0],400)
  with patch.object(app.Handler,'identity',return_value={'userId':'alice'}):self.assertTrue(self.request('/library')[1]['scores'])
 def test_shared_sound_setting(self):
  with patch.object(app,'upstream',return_value=(200,{'account':{'userId':'sound-test','soundEnabled':False},'records':[{'private':'health'}]},[])) as forward:
   status,payload=self.request('/auth/sound',{'soundEnabled':False},'PUT');self.assertEqual(status,200);self.assertFalse(payload['account']['soundEnabled']);self.assertNotIn('records',payload)
   self.assertEqual(forward.call_args.args[:3],('/api/sound','PUT',{'soundEnabled':False}))
 def test_origin_guard(self):self.assertEqual(self.request('/scores',{'notes':[]},origin='https://evil.example')[0],401)
 def test_catalog_summary_and_full_score(self):
  s=self.request('/catalog')[1]['tunes'];self.assertGreater(len(s),1000);self.assertTrue(s[0]['summaryOnly']);self.assertLessEqual(len(s[0]['notes']),7);self.assertNotIn('scoreText',s[0]);self.assertGreater(len(self.request('/tunes/'+s[0]['id'])[1]['notes']),7)
 def test_transposed_and_offset_melody_match(self):
  t=app.CATALOG[3];q=[dict(n,midi=n['midi']+5) for n in t['notes'][8:35] if n['midi'] is not None];matches=app.match_notes(q);self.assertIn(t['id'],[m['id'] for m in matches])
 def test_audio_pitch(self):
  buf=io.BytesIO()
  with wave.open(buf,'wb') as w:
   w.setparams((1,2,8000,0,'NONE','not compressed'))
   for midi in [62,64,66,67,69,71,73,74]:
    samples=[int(16000*math.sin(2*math.pi*440*2**((midi-69)/12)*t/8000)) for t in range(4000)];w.writeframes(struct.pack('<'+'h'*len(samples),*samples))
  notes=app.pitch_extract(buf.getvalue());self.assertEqual([n['midi'] for n in notes],[62,64,66,67,69,71,73,74])
if __name__=='__main__':unittest.main()
