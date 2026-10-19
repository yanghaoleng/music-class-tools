"""Import explicitly labeled melody references from the documented JE public API.
JE does not encode reliable rhythm; these records must never be presented as full scores.
"""
import hashlib,json,pathlib,re,urllib.request
from concurrent.futures import ThreadPoolExecutor
from importlib.machinery import SourceFileLoader
ROOT=pathlib.Path(__file__).resolve().parents[1]
helper=SourceFileLoader('catalog_builder',str(ROOT/'ops/build-catalog.py')).load_module()
cache=ROOT/'cache';out=ROOT/'catalog'
def page(i):
 p=cache/f'je-page{i}.json'
 try:
  if not p.exists():p.write_bytes(urllib.request.urlopen(f'https://api.github.com/repos/zytx121/je/issues?per_page=100&page={i}&state=open',timeout=30).read())
  value=json.loads(p.read_bytes());return value if isinstance(value,list) else []
 except Exception as e:print('JE page unavailable',i,str(e)[:60],flush=True);return []
def parse(issue):
 body=issue.get('body') or '';blocks=re.findall(r'```[^\n]*\n([\s\S]*?)```',body)
 if not blocks:return None
 # Explicit instructions for mid-song modulation make the free-form source ambiguous.
 if any(s in '\n'.join(blocks) for s in ['升半音','降半音','升全音','降全音','转调']):return None
 music='\n'.join(line for block in blocks for line in block.splitlines() if not re.search('[A-Zac-z\u4e00-\u9fff]',line))
 if len(re.findall('[1-7]',music))<12:return None
 key=re.search(r'1\s*[=＝]\s*([#b]?)([A-G])([#b]?)',body)
 offset=0
 if key:offset=({'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[key[2]]+(key[1]+key[3]).count('#')-(key[1]+key[3]).count('b'))%12
 octave=0;alter=0;events=[]
 for c in music:
  if c in '(（':octave-=1
  elif c in ')）':octave+=1
  elif c in '[〖':octave+=1
  elif c in ']〗':octave-=1
  elif c=='#':alter=1
  elif c=='b':alter=-1
  elif c in '1234567':
   pitch=60+offset+octave*12+[0,2,4,5,7,9,11][int(c)-1]+alter;alter=0
   if not 21<=pitch<=108:return None
   events.append({'pitch':pitch,'beat':len(events),'length':1,'staff':1,'voice':'melody','measure':''})
 if not 12<=len(events)<=2500 or abs(octave)>0:return None
 title=issue['title'].strip();composer=re.search(r'作曲[：:]\s*([^\n]+)',body);singer=re.search(r'歌手[：:]\s*([^\n]+)',body)
 score={'title':title,'composer':composer[1].strip() if composer else '', 'events':events,'keyFifths':0,'timeSignature':'','beats':len(events)}
 meta=helper.enrich(score,'je-'+str(issue['number']),issue['html_url'],'自由神社 JE 旋律谱',{'license':'MIT (repository); community melody reference'})
 meta.update(kind='melody',version='主旋律参考 · 原谱未记节奏',aliases=(meta['aliases']+' '+(singer[1].strip() if singer else '')).strip())
 p=out/'scores'/(meta['id']+'.json');full=json.loads(p.read_text());full.update(meta);p.write_text(json.dumps(full,ensure_ascii=False,separators=(',',':')))
 return meta
with ThreadPoolExecutor(max_workers=3) as pool:issues=[x for rows in pool.map(page,range(1,16)) for x in rows]
items=[]
for issue in issues:
 try:
  record=parse(issue)
  if record:items.append(record)
 except Exception:pass
index=json.loads((out/'index.json').read_text());index['items']=[i for i in index['items'] if not i['id'].startswith('je-')]+items
index['sources'].append({'name':'自由神社 JE','url':'https://github.com/zytx121/je','note':'Melody references only; original notation does not encode rhythm.'})
(out/'index.json').write_text(json.dumps(index,ensure_ascii=False,separators=(',',':')))
print('Imported JE melodies:',len(items),'Chinese titles:',sum(bool(re.search('[\u4e00-\u9fff]',r['title'])) for r in items),'Total:',len(index['items']),flush=True)
