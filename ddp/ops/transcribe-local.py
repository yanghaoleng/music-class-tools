"""Offline contour reading. No network, no remote models, no API keys.
Preserves private originals and per-note confidence; results always need review.
"""
from pathlib import Path
import cv2,numpy as np,json,re,subprocess,statistics,sys
ROOT=Path(__file__).resolve().parents[1];DATA=ROOT/'private-import'

def read_score(file,debug=False):
 im=cv2.imdecode(np.fromfile(str(file),dtype=np.uint8),cv2.IMREAD_COLOR)
 h,w=im.shape[:2];scale=min(1,1600/w);im=cv2.resize(im,None,fx=scale,fy=scale);h,w=im.shape[:2]
 gray=cv2.cvtColor(im,cv2.COLOR_BGR2GRAY)
 mask=cv2.inRange(gray,0,185)
 contours,_=cv2.findContours(mask,cv2.RETR_TREE,cv2.CHAIN_APPROX_SIMPLE)
 circles=[]
 for c in contours:
  x,y,cw,ch=cv2.boundingRect(c);a=cv2.contourArea(c)
  if y<h*.12 or not (3<=cw<=18 and 3<=ch<=18) or not .55<cw/ch<1.7 or a<5:continue
  if (4*np.pi*a/(cv2.arcLength(c,True)**2+1e-6))<.45:continue
  cx,cy=x+cw/2,y+ch/2;r=(cw+ch)/4
  if any(abs(cx-v[0])<2.5 and abs(cy-v[1])<2.5 for v in circles):continue
  dark=gray[max(0,round(cy-r*.35)):round(cy+r*.35)+1,max(0,round(cx-r*.35)):round(cx+r*.35)+1].mean()<120
  circles.append((cx,cy,r,bool(dark)))
 columns=[]
 for p in sorted(circles):
  group=next((g for g in columns if abs(statistics.mean(v[0] for v in g)-p[0])<3.5),None)
  if group is None:columns.append([p])
  else:group.append(p)
 fingers=[]
 for group in columns:
  group.sort(key=lambda p:p[1])
  for i in range(len(group)-5):
   seq=group[i:i+6];gaps=np.diff([v[1] for v in seq]);gap=float(np.median(gaps))
   if not 5<=gap<=25 or np.max(np.abs(gaps-gap))>gap*.23:continue
   if max(p[2] for p in seq)>min(p[2] for p in seq)*1.8:continue
   if any(abs(seq[0][0]-f['x'])<7 and abs(seq[0][1]-f['y'])<gap*4 for f in fingers):continue
   # Whistle stems have enclosing lines just outside each column of holes.
   x=float(np.median([p[0] for p in seq]));y=seq[0][1];bottom=seq[-1][1]
   pattern=''.join('x' if p[3] else 'o' for p in seq)
   mapping={'xxxxxx':62,'xxxxxo':64,'xxxxoo':66,'xxxooo':67,'xxoooo':69,'xooooo':71,'oooooo':73,'oxxooo':72,'oxxxxx':74}
   midi=mapping.get(pattern)
   if midi is None:continue
   # An isolated + below the sixth hole signals overblowing.
   r=float(np.median([p[2] for p in seq]));crop=mask[int(bottom+gap*.5):int(bottom+gap*2.5),int(max(0,x-gap*.5)):int(x+gap*.5)]
   plus=False
   if crop.size:
    cc,_=cv2.findContours(crop,cv2.RETR_EXTERNAL,cv2.CHAIN_APPROX_SIMPLE)
    for c in cc:
     px,py,pw,ph=cv2.boundingRect(c)
     if pw>=4 and ph>=4 and .55<pw/ph<1.8 and cv2.contourArea(c)/max(1,pw*ph)<.75:plus=True
   if plus and pattern!='oxxxxx':midi+=12
   # Duration inferred from underlines just above the stem. Dots/rests require review.
   y0=max(0,round(y-gap*2.75));y1=round(y-gap*2.05);x0=max(0,round(x-gap*1.2));x1=round(x+gap*1.2)
   region=mask[y0:y1,x0:x1];lengths=[]
   if region.size:
    kernel=cv2.getStructuringElement(cv2.MORPH_RECT,(max(5,round(gap*.75)),1));lines=cv2.morphologyEx(region,cv2.MORPH_OPEN,kernel)
    count,_,stats,_=cv2.connectedComponentsWithStats(lines)
    for sx,sy,sw,sh,area in stats[1:]:
     if sw>=gap*.75 and sh<=max(3,gap*.3):lengths.append(sy)
   underlines=len(lengths);duration=.25 if underlines>=2 else .5 if underlines else 1
   fingers.append({'x':round(x,2),'y':round(y,2),'bottom':round(bottom,2),'gap':round(gap,2),'pattern':pattern,'midi':midi,'duration':duration,'plus':plus,'confidence':'needs-review'})
 # Group into score rows according to top-hole baseline, then left-to-right.
 rows=[]
 for f in sorted(fingers,key=lambda f:f['y']):
  row=next((row for row in rows if abs(np.median([v['y'] for v in row])-f['y'])<max(15,f['gap']*2)),None)
  if row is None:rows.append([f])
  else:row.append(f)
 ordered=[f for row in rows for f in sorted(row,key=lambda f:f['x'])]
 if debug:
  print(json.dumps({'size':[w,h],'circles':len(circles),'rows':len(rows),'notes':len(ordered),'first':ordered[:12]},ensure_ascii=False,indent=2))
  for f in ordered:cv2.rectangle(im,(int(f['x']-9),int(f['y']-6)),(int(f['x']+9),int(f['bottom']+8)),(0,0,255),1)
  cv2.imwrite('/tmp/ddp-local-debug.jpg',im)
 return ordered

if __name__=='__main__':
 if len(sys.argv)>1:read_score(Path(sys.argv[1]),True);sys.exit()
 manifest=json.loads((DATA/'manifest.json').read_text());names=['C','C#','D','Eb','E','F','F#','G','G#','A','Bb','B']
 for i,item in enumerate(manifest):
  extracted=read_score(DATA/'originals'/item['file']);item['detectedNotes']=len(extracted);item['status']='local-draft' if extracted else 'manual-review'
  item['scoreText']='DDP/1\n'+' '.join(names[n['midi']%12]+str(n['midi']//12-1)+':'+str(n['duration']) for n in extracted)
  item['rhythmKnown']=False
  item['transcriptionMethod']='本地孔位轮廓识别；节奏、休止、装饰音和调性尚待校对'
  (DATA/'analysis').mkdir(exist_ok=True);(DATA/'analysis'/(item['id']+'.json')).write_text(json.dumps(extracted,ensure_ascii=False))
  if (i+1)%20==0:print('processed',i+1,'/',len(manifest),flush=True)
 (DATA/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print('DONE',len(manifest),'drafts',sum(bool(x['detectedNotes']) for x in manifest),'notes',sum(x['detectedNotes'] for x in manifest),flush=True)
