// YIN-style cumulative normalized difference. All microphone samples stay local.
export function detectPitch(input,sampleRate){
 const step=sampleRate>32000?2:1,rate=sampleRate/step;
 const data=step===1?input:Float32Array.from({length:Math.floor(input.length/step)},(_,i)=>input[i*step]);
 const size=Math.floor(data.length/2);let energy=0;for(const v of data)energy+=v*v;
 if(Math.sqrt(energy/data.length)<.008)return null;
 const max=Math.min(size-1,Math.ceil(rate/110)),min=Math.max(2,Math.floor(rate/5000));
 const diff=new Float32Array(max+1);let sum=0;
 for(let tau=1;tau<=max;tau++){let d=0;for(let j=0;j<size;j++){const v=data[j]-data[j+tau];d+=v*v}sum+=d;diff[tau]=sum?d*tau/sum:1}
 let lag=-1;for(let tau=min;tau<max;tau++)if(diff[tau]<.15){while(tau+1<max&&diff[tau+1]<diff[tau])tau++;lag=tau;break}
 if(lag<0||diff[lag]>.15)return null;
 const left=diff[lag-1]??diff[lag],right=diff[lag+1]??diff[lag],den=left-2*diff[lag]+right;
 const refined=lag+(den?(left-right)/(2*den):0),frequency=rate/refined;
 return {frequency,midi:69+12*Math.log2(frequency/440),confidence:1-diff[lag]};
}
export class FollowSession{
 constructor(notes,bpm=96,{soundOctave=12,rhythmKnown=true}={}){
  let beat=0;this.targets=[];
  notes.forEach((n,index)=>{if(n.midi!=null)this.targets.push({index,midi:n.midi+soundOctave,start:beat*60/bpm});beat+=n.duration});
  this.position=0;this.hits=[];this.pitchErrors=[];this.rhythmKnown=rhythmKnown;this.candidate=null;this.released=true;this.lastSound=null;
 }
 get target(){return this.targets[this.position]}
 feed(midi,time){
  const target=this.target;if(!target)return null;
  if(midi==null){if(this.lastSound==null||time-this.lastSound>.035)this.released=true;this.candidate=null;return null}
  this.lastSound=time;
  const cents=(midi-target.midi)*100;
  const previous=this.hits.at(-1);
  // Sustaining the preceding correct note is not a wrong attempt at the next.
  if(previous&&!this.released&&Math.abs(midi-previous.midi)<.4){this.candidate=null;return null}
  this.pitchErrors.push(Math.min(100,Math.abs(cents)));
  if(Math.abs(cents)>40||(previous?.midi===target.midi&&!this.released)){this.candidate=null;return null}
  if(this.candidate==null)this.candidate=time;
  if(time-this.candidate<.08)return null;
  // A repeated pitch requires a new breath/tongue gap; one held note never
  // advances through a run of identical notes.
  const hit={...target,time:this.candidate,cents};this.hits.push(hit);this.position++;this.candidate=null;this.released=false;
  return {hit,next:this.target,done:!this.target};
 }
 result(){
  const average=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
  const errors=this.hits.slice(1).map((hit,i)=>{const previous=this.hits[i],expected=hit.start-previous.start;return Math.min(1,Math.abs(hit.time-previous.time-expected)/Math.max(.15,expected))});
  const mean=average(this.pitchErrors),timing=average(errors);
  const pitch=mean==null?null:Math.round(Math.max(0,100-mean));
  const rhythm=!this.rhythmKnown||timing==null?null:Math.round(100*(1-timing));
  return {pitch,rhythm,score:pitch==null?null:Math.round(rhythm==null?pitch:pitch*.6+rhythm*.4),completed:this.hits.length,total:this.targets.length};
 }
}
export async function listenMicrophone(onPitch,{signal}={}){
 if(!navigator.mediaDevices?.getUserMedia)throw Error('请使用 HTTPS 页面和支持麦克风的浏览器。');
 const stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:false,noiseSuppression:false,autoGainControl:false}});
 if(signal?.aborted){stream.getTracks().forEach(t=>t.stop());throw new DOMException('已取消','AbortError')}
 let context,timer,closed=false,previousSession;
 try{if(navigator.audioSession){previousSession=navigator.audioSession.type;navigator.audioSession.type='play-and-record'}}catch{}
 const stop=()=>{if(closed)return;closed=true;signal?.removeEventListener('abort',stop);clearInterval(timer);stream.getTracks().forEach(t=>t.stop());try{if(previousSession&&navigator.audioSession?.type==='play-and-record')navigator.audioSession.type=previousSession}catch{}if(context&&context.state!=='closed')void context.close()};
 signal?.addEventListener('abort',stop,{once:true});
 try{
  const AudioContext=window.AudioContext||window.webkitAudioContext;context=new AudioContext();await context.resume();if(closed)throw new DOMException('已取消','AbortError');
  const source=context.createMediaStreamSource(stream),analyser=context.createAnalyser();analyser.fftSize=4096;source.connect(analyser);
  const data=new Float32Array(analyser.fftSize);
  timer=setInterval(()=>{analyser.getFloatTimeDomainData(data);onPitch(detectPitch(data,context.sampleRate),performance.now()/1000)},25);
  stream.getTracks().forEach(track=>track.addEventListener('ended',()=>{if(!closed){stop();onPitch(null,performance.now()/1000,'麦克风已断开，本次跟吹已停止。')}}));
  return stop;
 }catch(e){stop();throw e}
}
