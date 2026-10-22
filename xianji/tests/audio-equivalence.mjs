import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const b=await chromium.launch({channel:'chrome',headless:true});const p=await b.newPage();
try{await p.goto(process.env.XIANJI_URL || 'http://127.0.0.1:5186/xianji/');const results=await p.evaluate(async()=>{
 const {voice,SYNTHS}=await import('/xianji/src/synth.mjs');
 const output=[];
 for(const id of ['keys','pluck','bass','sub','choir','air','glass','lead']){
  const rate=44100,ctx=new OfflineAudioContext(2,rate*2,rate),merger=ctx.createChannelMerger(2);merger.connect(ctx.destination);
  const left=ctx.createGain(),right=ctx.createGain();left.connect(merger,0,0);right.connect(merger,0,1);
  const spec=SYNTHS[id],midi=60-(id==='bass'?12:id==='sub'?24:0),f=440*2**((midi-69)/12),len=.35;
  voice(ctx,left,{instrument:id,midi:60,volume:.7},0,len);
  const g=ctx.createGain();let out=right;
  if(spec.cutoff){const filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=spec.cutoff;filter.Q.value=spec.q||.45;filter.connect(right);out=filter;}g.connect(out);
  const oscs=spec.partials.map(([ratio,level,type])=>{const o=ctx.createOscillator(),a=ctx.createGain();o.type=type;o.frequency.value=f*ratio;a.gain.value=level;o.connect(a);a.connect(g);o.start(0);o.stop(1.9);return o;});
  if(spec.vibrato){const l=ctx.createOscillator(),dep=ctx.createGain();l.frequency.value=spec.rate;dep.gain.value=spec.vibrato;l.connect(dep);oscs.forEach(o=>dep.connect(o.detune));l.start(0);l.stop(1.9);}
  const peak=.7*(spec.continuous?.13:.16);g.gain.setValueAtTime(.0001,0);g.gain.exponentialRampToValueAtTime(peak,spec.attack);
  if(spec.continuous)g.gain.setValueAtTime(peak,len);else g.gain.exponentialRampToValueAtTime(peak*.45,len);
  g.gain.exponentialRampToValueAtTime(.0001,len+spec.release);
  const buf=await ctx.startRendering(),a=buf.getChannelData(0),bb=buf.getChannelData(1);let diff=0,signal=0,dot=0,energy=0;
  for(let n=100;n<rate*.3;n++){diff+=(a[n]-bb[n])**2;signal+=bb[n]**2;dot+=a[n]*bb[n];energy+=a[n]**2;}
  output.push({id,error:Math.sqrt(diff/signal),correlation:dot/Math.sqrt(signal*energy)});
 }return output;
});for(const result of results){assert.ok(result.error<.001,`${result.id} level/waveform drift`);assert.ok(result.correlation>.999,`${result.id} waveform correlation`);}console.log('PASS merged oscillators preserve original waveforms within 0.1% RMS error');}finally{await b.close();}
