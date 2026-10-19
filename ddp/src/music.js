export const names=['C','C♯','D','E♭','E','F','F♯','G','G♯','A','B♭','B'];
export function noteName(m){return m==null?'休止':names[((m%12)+12)%12]+(Math.floor(m/12)-1)}
export function rhythmGrid(notes){return [1,2,3,4,6,8,12,16].find(grid=>notes.every(n=>Math.abs(n.duration-Math.max(1,Math.round(n.duration*grid))/grid)<.025))||8}
export function durationTicks(duration,grid){return Math.max(1,Math.round(duration*grid))}
export function encodeNotes(notes,{integer=false}={}){const grid=integer?rhythmGrid(notes):1;return 'DDP/1\n'+(integer?'@ticks='+grid+'\n':'')+notes.map(n=>(n.midi==null?'R':noteName(n.midi).replace('♯','#').replace('♭','b'))+':'+(integer?durationTicks(n.duration,grid):n.duration)).join(' ')}
export function decodeNotes(text){const tokens=text.replace(/^DDP\/1\s*/,'').trim().split(/\s+/);const header=tokens.find(t=>t.startsWith('@ticks='));const grid=header?Number(header.slice(7)):1;if(!Number.isInteger(grid)||grid<1||grid>64)throw Error('每拍格数应为 1–64 的整数');const values={C:0,D:2,E:4,F:5,G:7,A:9,B:11};return tokens.filter(t=>t!=='|'&&!t.startsWith('@ticks=')).map(t=>{let match=/^(R|[A-G][#b]?-?\d):([\d.]+)$/.exec(t);if(!match)throw Error('无法读取音符：'+t);let pitch=match[1],duration=Number(match[2])/grid;if(!Number.isFinite(duration)||duration<.03||duration>16)throw Error('时值应为 0.03–16 拍');if(pitch==='R')return {midi:null,duration};let [,n,a,o]=/^([A-G])([#b]?)(-?\d)$/.exec(pitch);let midi=(Number(o)+1)*12+values[n]+(a==='#'?1:a==='b'?-1:0);if(midi<36||midi>100)throw Error('音高应在 C2–E7 之间');return {midi,duration}})}
// D whistle, holes ordered from mouthpiece to foot. x = closed, o = open, h = half.
const patterns={0:'xxxxxx',1:'xxxxx h',2:'xxxxxo',3:'xxxxho',4:'xxxxoo',5:'xxxooo',6:'xxhooo',7:'xxoooo',8:'xhoooo',9:'xooooo',10:'oxxooo',11:'oooooo'};
// Written pitches: a high D whistle sounds one octave above these notes.
// The vented upper D and upper C half-hole follow the Woodwind Fingering Guide.
export function fingering(midi,whistle=62){
 if(midi==null)return {rest:true};const delta=midi-whistle;
 if(delta<0||delta>24)return {unplayable:true};
 const oct=Math.floor(delta/12),pc=delta%12;
 const pattern=delta===12||delta===24?'oxxxxx':delta===22?'hooooo':patterns[pc].replace(/ /g,'');
 return {holes:pattern.split(''),oct,half:pattern.includes('h'),cross:pc===10&&oct===0};
}
// Keep the original data intact. Prefer a whole-tune octave shift, then adapt
// individual extremes to the two common registers, always retaining pitch class.
export function arrangeWhistle(notes,whistle=62,transpose=0){
 const pitched=notes.filter(n=>n.midi!=null);
 const shifts=[0,12,-12,24,-24,36,-36,48,-48];
 const cost=shift=>pitched.filter(n=>n.midi+transpose+shift<whistle||n.midi+transpose+shift>whistle+23).length;
 const shift=shifts.reduce((best,v)=>cost(v)<cost(best)?v:best,0);
 let adjusted=0,folded=0;
 const arranged=notes.map(n=>{if(n.midi==null)return {...n};let midi=n.midi+transpose+shift;
 const before=midi;while(midi<whistle)midi+=12;while(midi>whistle+23)midi-=12;
 if(midi!==before)folded++;if(midi!==n.midi+transpose)adjusted++;
 return {...n,midi,originalMidi:n.midi+transpose,octaveShift:midi-n.midi-transpose};});
 return {notes:arranged,shift,adjusted,folded};
}
// Use a real media element for tune playback. On iOS this is media audio,
// while the separate UI sound pack continues to respect the mute switch.
export function preparePlayback(notes,bpm=100,{skipLongRests=true}={}){
 const grid=rhythmGrid(notes),events=[];let cursor=0;let first=notes.findIndex(n=>n.midi!=null),last=notes.length-1;
 while(last>=0&&notes[last].midi==null)last--;
 if(first<0)return {events,duration:0,grid};
 for(let i=first;i<=last;i++){
  const n=notes[i];let beats=durationTicks(n.duration,grid)/grid;
  if(n.midi==null){while(i+1<=last&&notes[i+1].midi==null)beats+=durationTicks(notes[++i].duration,grid)/grid;if(skipLongRests)beats=Math.min(beats,1)}
  const duration=beats*60/bpm;events.push({index:i,midi:n.midi,start:cursor,end:cursor+duration});cursor+=duration;
 }
 return {events,duration:cursor,grid};
}
export function renderWave(notes,bpm=100,options={}){
 const playback=preparePlayback(notes,bpm,options),sampleRate=16000;
 if(playback.duration>900){const error=Error('这份曲谱较长，请分段后试听（单次最多15分钟）。');error.code='SCORE_TOO_LONG';throw error}
 const count=Math.ceil(playback.duration*sampleRate),buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer);
 const str=(p,value)=>{for(let i=0;i<value.length;i++)view.setUint8(p+i,value.charCodeAt(i))};
 str(0,'RIFF');view.setUint32(4,36+count*2,true);str(8,'WAVE');str(12,'fmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,sampleRate,true);view.setUint32(28,sampleRate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);str(36,'data');view.setUint32(40,count*2,true);
 for(const e of playback.events){if(e.midi==null)continue;const frequency=440*2**((e.midi-69)/12),length=e.end-e.start,from=Math.round(e.start*sampleRate),to=Math.min(count,Math.round(e.end*sampleRate));for(let i=from;i<to;i++){const t=(i-from)/sampleRate,envelope=Math.max(0,Math.min(1,t/.012,(length-t)/.025));view.setInt16(44+i*2,Math.round(6400*envelope*Math.sin(2*Math.PI*frequency*t)),true)}}
 return {...playback,buffer};
}
let currentPlayback=null;
export function stopAudio(){if(!currentPlayback)return;const {audio,url,timer}=currentPlayback;currentPlayback=null;clearInterval(timer);audio.pause();audio.removeAttribute('src');audio.load();audio.remove();URL.revokeObjectURL(url);if(typeof navigator!=='undefined'&&navigator.mediaSession)navigator.mediaSession.playbackState='none'}
export function pauseAudio(){if(!currentPlayback)return;currentPlayback.audio.pause();if(navigator.mediaSession)navigator.mediaSession.playbackState='paused'}
export function seekAudio(seconds){if(currentPlayback){currentPlayback.audio.currentTime=Math.max(0,Math.min(seconds,currentPlayback.audio.duration||0))}}
export async function resumeAudio(){if(!currentPlayback)return;await currentPlayback.audio.play();if(navigator.mediaSession)navigator.mediaSession.playbackState='playing'}
export async function playNotes(notes,bpm=100,onNote=()=>{},onDone=()=>{},options={}){
 stopAudio();const wave=renderWave(notes,bpm,options);
 if(!wave.events.length){onNote(-1);onDone();return}
 const url=URL.createObjectURL(new Blob([wave.buffer],{type:'audio/wav'})),audio=document.createElement('audio');
 audio.preload='auto';audio.setAttribute('playsinline','');audio.style.display='none';audio.src=url;document.body.appendChild(audio);
 try{if(navigator.audioSession)navigator.audioSession.type='playback'}catch{}
 const playback={audio,url,timer:null};currentPlayback=playback;let previous=-1;
 const update=()=>{if(currentPlayback!==playback)return;options.onProgress?.(audio.currentTime,wave.duration);const event=wave.events.find(e=>audio.currentTime>=e.start&&audio.currentTime<e.end);const index=event?.index??-1;if(index!==previous){previous=index;onNote(index)}};
 const finish=()=>{if(currentPlayback===playback){stopAudio();onNote(-1);onDone()}};
 audio.onended=finish;
 audio.onerror=()=>{if(currentPlayback===playback){finish();options.onError?.('无法播放，请重新点按试听。')}};
 try{await audio.play();if(currentPlayback!==playback)return;const start=options.startTime??wave.events.find(e=>e.index>=(options.startIndex||0))?.start??0;if(start>0)audio.currentTime=Math.min(start,wave.duration);if(navigator.mediaSession){navigator.mediaSession.playbackState='playing';if(typeof MediaMetadata!=='undefined')navigator.mediaSession.metadata=new MediaMetadata({title:options.title||'洞洞谱试听',artist:'洞洞谱'})}playback.timer=setInterval(update,50);update()}catch(error){finish();throw error}
}
