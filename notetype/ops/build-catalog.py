"""Build a source-attributed score catalog from public MusicXML, never from user files."""
import csv,gzip,hashlib,io,json,math,pathlib,re,tarfile,urllib.request,urllib.parse,zipfile,xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
ROOT=pathlib.Path(__file__).resolve().parents[1]
OUT=ROOT/'catalog';OUT.mkdir(exist_ok=True);(OUT/'scores').mkdir(exist_ok=True)
CACHE=ROOT/'cache';CACHE.mkdir(exist_ok=True)
def number(v,default=0):
 try:return float(v)
 except:return default
def text(e,path,default=''):
 v=e.findtext(path)
 return v.strip() if v else default
def parse_score(raw):
 if raw[:2]==b'PK':
  z=zipfile.ZipFile(io.BytesIO(raw)); names=[x for x in z.namelist() if x.endswith(('.xml','.musicxml')) and 'META-INF' not in x]
  if not names:raise ValueError('No MusicXML')
  raw=z.read(names[0])
 r=ET.fromstring(raw)
 if r.tag!='score-partwise':raise ValueError('Only partwise scores supported')
 title=text(r,'work/work-title',text(r,'movement-title'))
 composer=next((e.text or '' for e in r.findall('identification/creator') if e.get('type')=='composer'),'')
 allparts=[];keys=[];times=[]
 for pi,p in enumerate(r.findall('part')):
  measures=[];div=1;transpose=0
  for m in p.findall('measure'):
   cur=0;last=0;end=0;notes=[]
   for e in m:
    if e.tag=='attributes':
     div=number(e.findtext('divisions'),div) or 1;transpose=number(e.findtext('transpose/chromatic'),transpose)
     if e.find('key/fifths') is not None:keys.append(int(number(e.findtext('key/fifths'))))
     if e.find('time/beats') is not None:times.append(f"{e.findtext('time/beats')}/{e.findtext('time/beat-type')}")
    elif e.tag in ('backup','forward'):
     cur+=number(e.findtext('duration'))/div*(-1 if e.tag=='backup' else 1)
    elif e.tag=='note':
     dur=number(e.findtext('duration'))/div;chord=e.find('chord') is not None;start=last if chord else cur
     pitch=e.find('pitch')
     if pitch is not None and dur>0 and e.find('grace') is None:
      step=pitch.findtext('step');octave=number(pitch.findtext('octave'),4);alter=number(pitch.findtext('alter'))
      midi=int((octave+1)*12+{'C':0,'D':2,'E':4,'F':5,'G':7,'A':9,'B':11}[step]+alter+transpose)
      if 21<=midi<=108:notes.append({'pitch':midi,'beat':round(start,5),'length':round(dur,5),'staff':int(number(e.findtext('staff'),1)),'voice':f'{pi}:{e.findtext("voice") or "1"}','measure':m.get('number',''),'tieStart':any(t.get('type')=='start' for t in e.findall('tie')),'tieStop':any(t.get('type')=='stop' for t in e.findall('tie'))})
     if not chord:cur+=dur;last=start
     end=max(end,cur,start+dur)
   if end<=0:end=4
   measures.append({'notes':notes,'length':end,'forward':m.find("barline/repeat[@direction='forward']") is not None,'backward':m.find("barline/repeat[@direction='backward']") is not None,'ending':next((x.get('number','') for x in m.findall('barline/ending') if x.get('type')=='start'),'')})
  # Expand ordinary two-pass repeats. Da capo/coda navigation is deliberately not guessed.
  events=[];at=0;i=0;repeat_start=0;counts={};second=False;guard=0
  while i<len(measures) and guard<len(measures)*3:
   guard+=1;mm=measures[i]
   if mm['forward']:repeat_start=i
   ending=mm['ending']
   skip=second and ending and '1' in ending and '2' not in ending
   if not skip:
    for n in mm['notes']:events.append({**n,'beat':round(at+n['beat'],5)})
    at+=mm['length']
   if mm['backward'] and counts.get(i,0)==0:
    counts[i]=1;i=repeat_start;second=True;continue
   i+=1
  # Join notated ties before alignment, retaining separate repeated note attacks.
  merged=[];ties={}
  for n in events:
   k=(n['voice'],n['pitch'])
   prev=ties.get(k)
   if n['tieStop'] and prev is not None and abs(prev['beat']+prev['length']-n['beat'])<.02:
    prev['length']+=n['length']
    if not n['tieStart']:ties.pop(k,None)
    continue
   nn={k:v for k,v in n.items() if k not in ('tieStart','tieStop')};merged.append(nn)
   if n['tieStart']:ties[k]=nn
  allparts.extend(merged)
 events=sorted(allparts,key=lambda n:(n['beat'],n['pitch']))
 if not 8<=len(events)<=16000:raise ValueError('Unsupported score size')
 return {'title':title,'composer':composer,'events':events,'keyFifths':keys[0] if keys else 0,'timeSignature':times[0] if times else '','beats':round(max(n['beat']+n['length'] for n in events),5)}
def aliases(title):
 pairs=[('fur elise','致爱丽丝'),('für elise','致爱丽丝'),('twinkle','小星星'),('ode to joy','欢乐颂'),('happy birthday','生日快乐'),('canon','卡农'),('moonlight','月光奏鸣曲'),('clair de lune','月光 德彪西'),('minuet','小步舞曲'),('nocturne','夜曲'),('entertainer','娱乐者'),('gymnop','第一号吉姆诺佩蒂'),('clementi','克莱门蒂'),('sonatina','小奏鸣曲'),('sonata','奏鸣曲'),('bach','巴赫'),('chopin','肖邦'),('mozart','莫扎特'),('beethoven','贝多芬'),('debussy','德彪西'),('maple leaf','枫叶拉格'),('greensleeves','绿袖子')]
 return ' '.join(zh for en,zh in pairs if en in title.lower())
def enrich(score,ident,source,source_name,meta=None):
 meta=meta or {};title=score['title'] or meta.get('title') or meta.get('song_name') or ident
 if title in ('NA','Untitled'):title=meta.get('title') or title
 composer=score['composer'] or meta.get('composer_name','')
 if composer=='NA':composer=''
 # Precompute a pitch-class distribution and transposition-invariant melody shingles.
 hist=[0.]*12;groups={}
 for n in score['events']:
  hist[n['pitch']%12]+=min(n['length'],2);key=round(n['beat']*8)/8;groups[key]=max(n['pitch'],groups.get(key,0))
 pitches=[groups[k] for k in sorted(groups)]
 ints=[(b-a)%12 for a,b in zip(pitches,pitches[1:])]
 grams=sorted(set((ints[i]*144+ints[i+1]*12+ints[i+2]) for i in range(max(0,len(ints)-2))))
 total=sum(x*x for x in hist)**.5 or 1
 fields={'id':ident,'title':title[:150],'composer':composer[:100],'aliases':aliases(title+' '+composer),'version':'简易编配' if re.search('easy|beginner|简易|初级',title,re.I) else ('旋律与和弦谱' if len(set(n['voice'] for n in score['events']))==1 else '公开曲谱版本'),'source':source,'sourceName':source_name,'license':meta.get('license','source-attributed'),'noteCount':len(score['events']),'beats':score['beats'],'keyFifths':score['keyFifths'],'timeSignature':score['timeSignature'],'hist':[round(v/total,5) for v in hist],'grams':grams}
 (OUT/'scores'/f'{ident}.json').write_text(json.dumps({**fields,'events':score['events']},ensure_ascii=False,separators=(',',':')))
 return fields

def curated():
 tree=json.load(open('/tmp/notetype-library-tree.json'))
 paths=[r['path'] for r in tree['tree'] if r['path'].startswith('scores/') and r['path'].endswith('.mxl')]
 # Files with explicitly misattributed modern work titles are excluded from this seed list.
 paths=[s for s in paths if not any(k in s.lower() for k in ['mariage','spring_waltz'])]
 def one(p):
  ident='mt-'+hashlib.sha1(p.encode()).hexdigest()[:12];url='https://raw.githubusercontent.com/musetrainer/library/master/'+urllib.parse.quote(p,safe='/')
  cache=CACHE/(ident+'.mxl')
  try:
   if not cache.exists():cache.write_bytes(urllib.request.urlopen(url,timeout=30).read())
   return enrich(parse_score(cache.read_bytes()),ident,'https://github.com/musetrainer/library/blob/master/'+urllib.parse.quote(p,safe='/'),'MuseTrainer 公开谱库')
  except Exception as e:print('Skip',p,str(e)[:80],flush=True)
 with ThreadPoolExecutor(max_workers=6) as pool:return [r for r in pool.map(one,paths) if r]

def pdmx_metadata():
 lookup={}
 with open(CACHE/'PDMX.csv',newline='') as f:
  for row in csv.DictReader(f):
   if row.get('license_conflict')!='False' or row.get('subset:all_valid')!='True':continue
   if row.get('has_paywall')=='True' or number(row.get('n_notes'))>16000 or number(row.get('n_notes'))<12:continue
   if row.get('is_best_unique_arrangement')!='True':continue
   # Keep a balanced useful subset: popular/rated scores, Chinese titles, guitar, or familiar piano repertoire.
   title=' '.join(row.get(k,'') for k in ['title','song_name','artist_name','composer_name'])
   wanted=(number(row.get('n_favorites'))>=3 or number(row.get('n_ratings'))>=2 or bool(re.search('[\u4e00-\u9fff]',title)) or 'guitar' in row.get('tags','').lower() or re.search('Twinkle|Fr.re Jacques|Ode to Joy|F.r Elise|Canon|Moonlight|Sonatina',title,re.I))
   if wanted:lookup[row['mxl'].lstrip('./')]=row
 return lookup

def pdmx(lookup,limit=3500):
 archive=CACHE/'pdmx-mxl.tar.gz';out=[];seen=0
 if not archive.exists():return out
 try:
  with tarfile.open(archive,mode='r|gz') as tar:
   for member in tar:
    key=member.name.lstrip('./')
    if key not in lookup:continue
    meta=lookup[key];ident='pd-'+pathlib.Path(key).stem;cache=OUT/'scores'/f'{ident}.json'
    try:
     raw=tar.extractfile(member).read();score=parse_score(raw)
     out.append(enrich(score,ident,'https://zenodo.org/records/15571083','PDMX 公开曲谱',meta));seen+=1
     if seen%250==0:print('PDMX scores',seen,flush=True)
     if seen>=limit:break
    except Exception as e:pass
 except (EOFError,tarfile.ReadError,OSError) as e:print('Archive download still in progress; kept',len(out),'available scores',flush=True)
 return out

if __name__=='__main__':
 import sys
 items=curated()
 if (CACHE/'PDMX.csv').exists() and '--seed-only' not in sys.argv:
  lookup=pdmx_metadata();print('Eligible PDMX metadata',len(lookup),flush=True);items+=pdmx(lookup)
 # A transparent teaching scale for exercising the complete matching step with the bundled demo.
 ev=[{'pitch':p,'beat':i,'length':.78,'staff':1,'voice':'0:1','measure':str(i//4+1)} for i,p in enumerate([60,62,64,65,67,69,71,72,72,71,69,67,65,64,62,60])]
 items.append(enrich({'title':'C 大调音阶练习','composer':'NoteType 教学示例','events':ev,'keyFifths':0,'timeSignature':'4/4','beats':16},'demo-scale','/notetype/demo.mp4','内置教学示例'))
 payload={'version':2,'createdAt':'2026-10-16','sources':[{'name':'MuseTrainer','url':'https://github.com/musetrainer/library'},{'name':'PDMX','url':'https://zenodo.org/records/15571083','reference':'Long et al., PDMX, ICASSP 2025; no_license_conflict subset'}],'items':items}
 (OUT/'index.json').write_text(json.dumps(payload,ensure_ascii=False,separators=(',',':')))
 print('Catalog ready:',len(items),'scores; Chinese titles:',sum(bool(re.search('[\u4e00-\u9fff]',x['title'])) for x in items),flush=True)
