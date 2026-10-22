import {instrumentPitch} from './model.mjs';

// Relative partials, envelopes and resonant filters make each instrument audible
// as a distinct sound. Continuous instruments reuse voices between adjacent steps.
export const SYNTHS={
  kick:{attack:.002,release:.5,percussion:true},
  cymbal:{attack:.0015,release:.6,percussion:true},
  keys:{partials:[[1,1,'sine'],[2,.22,'sine'],[3,.07,'sine']],attack:.008,release:.22},
  bell:{partials:[[1,1,'sine'],[2.76,.22,'sine'],[5.4,.08,'sine']],attack:.006,release:.85},
  pluck:{partials:[[1,.65,'triangle'],[2,.13,'sine']],attack:.006,release:.22},
  bass:{partials:[[1,.85,'sine'],[2,.16,'triangle']],attack:.012,release:.26},
  pad:{partials:[[1,.5,'sine'],[1.004,.3,'triangle'],[.997,.2,'sine']],attack:.14,release:.95,glide:.06,continuous:true,cutoff:1800},
  analog:{partials:[[.998,.33,'sawtooth'],[1.002,.33,'sawtooth'],[1,.34,'sine']],attack:.065,release:.5,glide:.045,continuous:true,cutoff:1300,q:.7},
  strings:{partials:[[.996,.25,'sawtooth'],[1.004,.25,'sawtooth'],[2,.16,'triangle']],attack:.22,release:1.35,glide:.075,continuous:true,cutoff:2100,vibrato:.9,rate:4.1},
  glass:{partials:[[1,.65,'sine'],[2,.2,'sine'],[3,.1,'sine'],[4.01,.05,'sine']],attack:.06,release:1.1,glide:.025,continuous:true,cutoff:6500},
  choir:{partials:[[1,.5,'sine'],[2,.2,'triangle'],[3,.1,'sine'],[4,.04,'sine']],attack:.18,release:1.2,glide:.08,continuous:true,cutoff:2200,vibrato:1.7,rate:4.7},
  lead:{partials:[[1,.6,'triangle'],[1.003,.22,'sawtooth'],[2,.1,'sine']],attack:.025,release:.32,glide:.055,continuous:true,cutoff:2600,q:1.3},
  air:{partials:[[1,.7,'sine'],[2,.13,'sine'],[3,.04,'triangle']],attack:.09,release:.65,glide:.045,continuous:true,cutoff:3400,vibrato:2.2,rate:5.2},
  sub:{partials:[[1,.75,'sine'],[2,.2,'sine'],[3,.05,'triangle']],attack:.055,release:.55,glide:.07,continuous:true,cutoff:500},
};
export const MAX_RELEASE=Math.max(...Object.values(SYNTHS).map(s=>s.release));
const hz=n=>440*2**((instrumentPitch(n.midi,n.instrument)-69)/12);

// Merge integer sine/triangle harmonics into one band-limited oscillator.
// Detuned and inharmonic partials stay separate, preserving their beating/tone.
const waveCache = new WeakMap();
function partialsFor(ctx, spec) {
  let cache = waveCache.get(ctx);
  if (!cache) {cache = new Map();waveCache.set(ctx, cache);}
  if (cache.has(spec)) return cache.get(spec);
  const combined = spec.partials.filter(([ratio,,type]) => Number.isInteger(ratio) && (type === 'sine' || type === 'triangle'));
  if (combined.length < 2) {const result = spec.partials.map(([ratio,level,type]) => ({ratio,level,type}));cache.set(spec, result);return result;}
  const real = new Float32Array(129), imag = new Float32Array(129);
  for (const [ratio,level,type] of combined) {
    if (type === 'sine') imag[ratio] += level;
    else for (let k = 1; k * ratio < imag.length; k += 2)
      imag[k * ratio] += level * 8 / Math.PI ** 2 * ((k % 4 === 1 ? 1 : -1) / (k * k));
  }
  const wave = ctx.createPeriodicWave(real, imag, {disableNormalization: true});
  const result = [{ratio: 1, level: 1, wave}, ...spec.partials.filter(p => !combined.includes(p)).map(([ratio,level,type]) => ({ratio,level,type}))];
  cache.set(spec, result);return result;
}

function oscillatorGraph(ctx,out,n,time){
  const spec=SYNTHS[n.instrument]||SYNTHS.keys,gain=ctx.createGain();
  let filter=null;
  if(spec.cutoff){filter=ctx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=spec.cutoff;filter.Q.value=spec.q||.45;gain.connect(filter);filter.connect(out);}else gain.connect(out);
  const oscillators = partialsFor(ctx, spec).map(({ratio,level,type,wave}) => {
    const osc = ctx.createOscillator(), amp = ctx.createGain();
    if (wave) osc.setPeriodicWave(wave); else osc.type = type;
    osc.frequency.setValueAtTime(hz(n) * ratio, time);amp.gain.value = level;
    osc.connect(amp);amp.connect(gain);osc.start(time);return {osc,amp,ratio};
  });
  let lfo=null,depth=null;
  if(spec.vibrato){lfo=ctx.createOscillator();depth=ctx.createGain();lfo.frequency.value=spec.rate;depth.gain.value=spec.vibrato;lfo.connect(depth);oscillators.forEach(({osc})=>depth.connect(osc.detune));lfo.start(time);}
  let finished=0;
  oscillators.forEach(({osc,amp})=>osc.addEventListener('ended',()=>{osc.disconnect();amp.disconnect();if(++finished===oscillators.length){gain.disconnect();filter?.disconnect();if(lfo){try{lfo.stop();}catch{}lfo.disconnect();depth.disconnect();}}}));
  return {spec,gain,oscillators,lfo};
}
// Cache percussion as short one-shot buffers: one source per hit, no per-hit
// oscillator banks or realtime noise generation on mobile Safari.
const percussionCache=new WeakMap();
function percussionBuffer(ctx,id) {
  let cache=percussionCache.get(ctx);
  if(!cache){cache=new Map();percussionCache.set(ctx,cache);}
  if(cache.has(id))return cache.get(id);
  const rate=ctx.sampleRate, seconds=id==='kick'?.5:.6;
  const buffer=ctx.createBuffer(1,Math.ceil(rate*seconds),rate), data=buffer.getChannelData(0);
  let phase=0,seed=8741,low=0,band=0;
  const hp=Math.exp(-2*Math.PI*2700/rate),lp=Math.exp(-2*Math.PI*8600/rate);
  for(let n=0;n<data.length;n++){
    const t=n/rate;seed=(Math.imul(seed,1664525)+1013904223)|0;
    const noise=(seed>>>0)/2147483648-1;
    if(id==='kick'){
      phase+=2*Math.PI*(43+100*Math.exp(-t/ .027))/rate;
      data[n]=Math.sin(phase)*(1-Math.exp(-t/.0015))*Math.exp(-t/.095)+noise*.04*Math.exp(-t/.006);
    }else{
      low=(1-hp)*noise+hp*low;band=(1-lp)*(noise-low)+lp*band;
      const metal=[3180,4230,5710,7310].reduce((sum,f)=>sum+Math.sin(2*Math.PI*f*t),0)/4;
      data[n]=(band*.7+metal*.3)*(1-Math.exp(-t/.001))*Math.exp(-t/.085);
    }
    // End exactly at silence to avoid an abrupt buffer boundary.
    data[n]*=Math.min(1,(data.length-n)/128);
  }
  cache.set(id,buffer);return buffer;
}
function percussionVoice(ctx,out,n,time) {
  const source=ctx.createBufferSource(), gain=ctx.createGain();
  source.buffer=percussionBuffer(ctx,n.instrument);gain.gain.value=n.volume*(n.instrument==='kick'?.42:.32);
  source.connect(gain);gain.connect(out);source.start(time);
  source.addEventListener('ended',()=>{source.disconnect();gain.disconnect();});return gain;
}
export function voice(ctx,out,n,time,len=.3){
  if(SYNTHS[n.instrument]?.percussion)return percussionVoice(ctx,out,n,time);
  if(SYNTHS[n.instrument]?.continuous)return sustainedVoice(ctx,out,n,time,len).gain;
  const {spec,gain,oscillators}=oscillatorGraph(ctx,out,n,time),peak=Math.max(.0001,n.volume*.16),end=time+Math.max(len,spec.attack+.01);
  gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(peak,time+spec.attack);gain.gain.exponentialRampToValueAtTime(Math.max(.0001,peak*.45),end);gain.gain.exponentialRampToValueAtTime(.0001,end+spec.release);
  oscillators.forEach(({osc})=>osc.stop(end+spec.release+.02));return gain;
}
export function sustainedVoice(ctx,out,n,time,len){
  const {spec,gain,oscillators,lfo}=oscillatorGraph(ctx,out,n,time);
  let held=Math.max(.0001,n.volume*.13);
  gain.gain.setValueAtTime(.0001,time);gain.gain.exponentialRampToValueAtTime(held,time+spec.attack);
  function release(at,length){const end=at+Math.max(length,spec.attack+.012);gain.gain.setValueAtTime(held,end);gain.gain.exponentialRampToValueAtTime(.0001,end+spec.release);oscillators.forEach(({osc})=>osc.stop(end+spec.release+.025));if(lfo)lfo.stop(end+spec.release+.025);}
  release(time,len);
  return {gain,extend(next,at,length){
    // Keep the current envelope and oscillator phase; move pitch without a new attack.
    if(gain.gain.cancelAndHoldAtTime)gain.gain.cancelAndHoldAtTime(at);else{gain.gain.cancelScheduledValues(at);gain.gain.setValueAtTime(held,at);}
    held=Math.max(.0001,next.volume*.13);gain.gain.setTargetAtTime(held,at,.025);
    oscillators.forEach(({osc,ratio})=>{osc.frequency.cancelScheduledValues(at);osc.frequency.setTargetAtTime(hz(next)*ratio,at,spec.glide);});
    release(at,length);
  }};
}
export function scheduleStep(ctx,out,notes,time,len,step,bank){
  const order=new Map();
  for(const n of notes){
    const branch=order.get(n.stroke)||0;order.set(n.stroke,branch+1);
    if(!SYNTHS[n.instrument]?.continuous){voice(ctx,out,n,time,len);continue;}
    const key=n.stroke+':'+branch+':'+n.instrument,previous=bank.get(key);
    if(previous&&previous.step===step-1){previous.handle.extend(n,time,len);previous.step=step;}
    else bank.set(key,{step,handle:sustainedVoice(ctx,out,n,time,len)});
  }
  for(const [key,value]of bank)if(value.step<step-1)bank.delete(key);
}

// Prepare reusable resources before the first gesture needs a sound. No samples
// are downloaded and no oscillators start during this warm-up.
export function prepareVoices(ctx) {
  for (const [id,spec] of Object.entries(SYNTHS)) {
    if (spec.percussion) percussionBuffer(ctx,id);
    else partialsFor(ctx,spec);
  }
}
