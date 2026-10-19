"""Generate a clearly labeled synthetic scale, with actual synchronized keyboard frames."""
import math,struct,wave,subprocess,pathlib
from PIL import Image,ImageDraw,ImageFont
root=pathlib.Path(__file__).resolve().parents[1]
melody=[60,62,64,65,67,69,71,72,72,71,69,67,65,64,62,60]
sr=44100
wav=root/'public/demo.wav'
with wave.open(str(wav),'wb') as w:
 w.setparams((1,2,sr,0,'NONE','not compressed'))
 samples=[]
 for i in range(sr*10):
  t=i/sr;v=0
  for j,p in enumerate(melody):
   dt=t-(.5+j*.55)
   if 0<=dt<.43:
    f=440*2**((p-69)/12)
    env=min(1,dt/.009)*min(1,(.43-dt)/.07)*math.exp(-dt*3)
    v+=.33*env*(math.sin(2*math.pi*f*dt)+.32*math.sin(4*math.pi*f*dt)+.12*math.sin(6*math.pi*f*dt))
  samples.append(struct.pack('<h',int(max(-1,min(1,v))*29000)))
 w.writeframes(b''.join(samples))
fontPaths=['/System/Library/Fonts/SFNS.ttf','/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
fontPath=next(p for p in fontPaths if pathlib.Path(p).exists())
font=lambda size:ImageFont.truetype(fontPath,size)
p=subprocess.Popen(['ffmpeg','-v','error','-y','-f','rawvideo','-pix_fmt','rgb24','-s','1280x620','-r','30','-i','pipe:0','-i',str(wav),'-c:v','libx264','-preset','veryfast','-crf','21','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart','-shortest',str(root/'public/demo.mp4')],stdin=subprocess.PIPE)
white=[p for p in range(48,85) if p%12 in [0,2,4,5,7,9,11]]
x0=105;kw=1070/len(white)
for frame in range(300):
 t=frame/30;active=next((pitch for j,pitch in enumerate(melody) if .5+j*.55<=t<.5+j*.55+.43),None)
 im=Image.new('RGB',(1280,620),'#1b3028');d=ImageDraw.Draw(im)
 for y in range(620):
  k=y/620;d.line((0,y,1280,y),fill=(int(30-10*k),int(53-17*k),int(43-13*k)))
 d.text((105,62),'A LITTLE SCALE.',font=font(54),fill='#f0f4df')
 d.text((108,140),'16 NOTES.  ONE SIMPLE MELODY.',font=font(15),fill='#91aa8c')
 d.text((108,187),'C  D  E  F  G  A  B  C',font=font(22),fill='#c8d9b3')
 d.rounded_rectangle((86,260,1194,494),radius=15,fill='#101c17')
 d.rounded_rectangle((96,270,1184,484),radius=9,fill='#324b3b')
 for j,pitch in enumerate(white):
  x=x0+j*kw
  d.rounded_rectangle((int(x),284,int(x+kw-2),473),radius=3,fill='#adc985' if active==pitch else '#ececdf')
  d.rectangle((int(x),454,int(x+kw-2),470),fill='#7c9e5b' if active==pitch else '#c7cbbd')
  if pitch%12==0:d.text((x+9,425),f'C{pitch//12-1}',font=font(12),fill='#4c6043')
 for j,pitch in enumerate(white[:-1]):
  if pitch%12 in [0,2,5,7,9]:
   x=x0+(j+1)*kw-kw*.29
   d.rounded_rectangle((int(x),282,int(x+kw*.58),400),radius=3,fill='#87aa67' if active==pitch+1 else '#19251e')
   d.rectangle((int(x+3),286,int(x+kw*.58-3),381),fill='#a4c47c' if active==pitch+1 else '#2c3b30')
 d.text((106,530),'SYNTHESIZED KEYBOARD DEMO',font=font(13),fill='#82977b')
 d.text((1015,530),'notetype',font=font(22),fill='#d4e0bd')
 p.stdin.write(im.tobytes())
p.stdin.close();assert p.wait()==0
wav.unlink()
print(root/'public/demo.mp4')
