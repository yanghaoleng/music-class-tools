import json,re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
source=root.parent/'notetype/catalog/scores'
base=[t for t in json.loads((root/'catalog.json').read_text()) if t['id'].startswith('oneill-')]
for path in sorted(source.glob('*.json')):
 if not (path.name.startswith('pop909-') and path.name.endswith('-melody.json') or path.name.startswith('je-')):continue
 d=json.loads(path.read_text());title=d['title'];aliases=d.get('aliases','')
 game=bool(re.search('魔兽|Warcraft|原神|Genshin|游戏|ゲーム|东方|東方|舰队|艦隊|崩坏|崩壊|碧蓝|碧藍|Arknights|明日方舟|Undertale|To the Moon|クロノ|final fantasy|最终幻想|最終幻想|星之卡比|塞尔达|ゼルダ|Minecraft|我的世界|NieR|尼尔|艾尔登|艾爾登|勇者|宝可梦|寶可夢|口袋妖怪',title+' '+aliases,re.I))
 if path.name.startswith('je-') and not game:continue
 events=sorted(d.get('events',[]),key=lambda x:x['beat']);notes=[];end=0
 for e in events:
  if e['beat']<end-.08:continue
  gap=e['beat']-end
  while gap>.12:
   rest=min(gap,16);notes.append({'midi':None,'duration':round(rest,4)});gap-=rest
  notes.append({'midi':e['pitch'],'duration':round(min(16,max(.03,e['length'])),4)});end=e['beat']+e['length']
 if not notes or len(notes)>1000:continue
 category='魔兽世界' if '魔兽' in title else '游戏配乐' if game else '影视配乐' if re.search('神话|仙剑|无羁|知否|凉凉|三生|红颜|千年|画心|星月|心爱的人|一直很安静|杀破狼|偏爱|六月的雨|诀别诗|天外飞仙',title) else '国内流行'
 base.append({'id':d['id'],'title':title,'subtitle':d.get('composer','')+' · '+d.get('version','主旋律'),'type':'流行' if category=='国内流行' else '配乐','category':category,'key':'原调','meter':d.get('timeSignature') or '未记节奏','difficulty':'旋律参考' if path.name.startswith('je-') else '主旋律','rhythmKnown':not path.name.startswith('je-'),'source':d.get('sourceName','')+' · '+d.get('license',''),'sourceUrl':d.get('source',''),'aliases':aliases,'notes':notes})
names=['C','C#','D','Eb','E','F','F#','G','G#','A','Bb','B']
for tune in base:
 if 'notes' in tune:
  tune['scoreText']='DDP/1\n'+' '.join(('R' if n['midi'] is None else names[n['midi']%12]+str(n['midi']//12-1))+':'+str(n['duration']) for n in tune.pop('notes'))
(root/'catalog.json').write_text(json.dumps(base,ensure_ascii=False,separators=(',',':')))
print('曲库',len(base),'分类', {k:sum(t.get('category','爱尔兰传统')==k for t in base) for k in ['爱尔兰传统','国内流行','影视配乐','游戏配乐','魔兽世界']})
