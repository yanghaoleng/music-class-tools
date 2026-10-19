import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {arrangeWhistle,decodeNotes,fingering} from '../src/music.js';
import {detectPitch,FollowSession} from '../src/practice.js';
const notes=[{midi:62,duration:1},{midi:64,duration:1},{midi:64,duration:1}];
function hold(session,midi,start,length=.15){let result;for(let t=start;t<start+length;t+=.025){const event=session.feed(midi,t);if(event)result=event}return result}
test('upper register uses overblow, vented D and half-hole C; no fabricated third register',()=>{
 assert.equal(fingering(74).holes.join(''),'oxxxxx');assert.equal(fingering(74).oct,1);
 assert.equal(fingering(84).holes.join(''),'hooooo');assert.equal(fingering(84).oct,1);
 assert.equal(fingering(86).oct,2);assert.equal(fingering(87).unplayable,true);
});
test('arrangement keeps originals, pitch classes and durations while fitting every catalog note',()=>{
 const low=[{midi:50,duration:.5},{midi:54,duration:1}];const a=arrangeWhistle(low);
 assert.equal(a.shift,12);assert.equal(a.folded,0);assert.equal(a.notes[0].midi,62);assert.equal(low[0].midi,50);
 const wide=arrangeWhistle([{midi:38,duration:1},{midi:100,duration:1}]);assert.ok(wide.folded>0);
 for(const tune of JSON.parse(fs.readFileSync(new URL('../catalog.json',import.meta.url)))){
  const original=decodeNotes(tune.scoreText);for(const whistle of [60,62])for(const trans of [-12,0,12]){
   const {notes}=arrangeWhistle(original,whistle,trans);notes.forEach((n,i)=>{assert.ok(!fingering(n.midi,whistle).unplayable,tune.id);if(n.midi!=null)assert.equal(Math.abs((n.midi-original[i].midi-trans)%12),0);assert.equal(n.duration,original[i].duration)})
  }
 }
});
test('local pitch detector resolves whistle frequencies and rejects silence/noise',()=>{
 for(const rate of [44100,48000])for(const midi of [50,62,74,86,97]){
  const f=440*2**((midi-69)/12);const wave=Float32Array.from({length:4096},(_,i)=>.2*Math.sin(2*Math.PI*f*i/rate)+.05*Math.sin(4*Math.PI*f*i/rate));
  const pitch=detectPitch(wave,rate);assert.ok(pitch,`midi ${midi}`);assert.ok(Math.abs(pitch.midi-midi)<.1,`${midi}: ${pitch.midi}`);
 }
 assert.equal(detectPitch(new Float32Array(4096),48000),null);
 let seed=123;const noise=Float32Array.from({length:4096},()=>{seed=(seed*1664525+1013904223)>>>0;return seed/2**32-.5});assert.equal(detectPitch(noise,48000),null);
});
test('follow waits for accurate sustained pitch, respects octave, requires a new onset for repeated notes',()=>{
 const s=new FollowSession(notes,60);assert.equal(hold(s,62,0),undefined);assert.equal(s.position,0);
 assert.equal(hold(s,74.5,.3),undefined);assert.equal(s.position,0);
 assert.equal(hold(s,74,1).hit.index,0);assert.equal(s.target.index,1);
 hold(s,74,1.3);assert.equal(s.position,1);
 assert.equal(hold(s,76,2).hit.index,1);hold(s,76,2.5,.5);assert.equal(s.position,2);
 s.feed(null,2.99);s.feed(null,3.04);const result=hold(s,76,3.1);assert.equal(result.done,true);assert.equal(s.result().completed,3);
});
test('scores use expected intervals including rests, ignore first-start latency and do not penalize sustained previous hits',()=>{
 const n=[{midi:62,duration:1},{midi:null,duration:1},{midi:64,duration:1}];
 const good=new FollowSession(n,60,{soundOctave:0});hold(good,62,10);hold(good,62,10.3,1);hold(good,64,12);
 assert.equal(good.result().pitch,100);assert.equal(good.result().rhythm,100);assert.equal(good.result().score,100);
 const slow=new FollowSession(n,60,{soundOctave:0});hold(slow,62,10);hold(slow,64,14);assert.equal(slow.result().rhythm,0);
 const partial=new FollowSession(notes);assert.equal(partial.result().score,null);hold(partial,74,1);assert.equal(partial.result().rhythm,null);assert.equal(partial.result().completed,1);
 const unknown=new FollowSession(n,60,{soundOctave:0,rhythmKnown:false});hold(unknown,62,1);hold(unknown,64,3);assert.equal(unknown.result().rhythm,null);
});
test('synthetic audio passes detector → follow advancement → pitch and rhythm report',()=>{
 const s=new FollowSession(notes,60),rate=48000;
 for(let index=0;index<notes.length;index++){
  const start=5+index,frequency=440*2**((notes[index].midi+12-69)/12);
  const buffer=Float32Array.from({length:4096},(_,i)=>.25*Math.sin(2*Math.PI*frequency*i/rate));
  const pitch=detectPitch(buffer,rate);s.feed(null,start-.08);s.feed(null,start-.03);
  for(let t=start;t<start+.8;t+=.025)s.feed(pitch.midi,t);
 }
 const result=s.result();assert.equal(result.completed,3);assert.equal(result.total,3);assert.ok(result.pitch>=98);assert.equal(result.rhythm,100);assert.ok(result.score>=99);
});
test('microphone stream is released on setup failure and cancellation while permission resolves',async()=>{
 const {listenMicrophone}=await import('../src/practice.js');let stops=0;const oldNavigator=Object.getOwnPropertyDescriptor(globalThis,'navigator'),oldWindow=globalThis.window;
 const stream={getTracks:()=>[{stop(){stops++},addEventListener(){}}]};
 try{
  Object.defineProperty(globalThis,'navigator',{configurable:true,value:{mediaDevices:{getUserMedia:async()=>stream}}});
  globalThis.window={AudioContext:class{constructor(){throw Error('setup failure')}}};
  await assert.rejects(listenMicrophone(()=>{}),/setup failure/);assert.equal(stops,1);
  const controller=new AbortController();controller.abort();await assert.rejects(listenMicrophone(()=>{},{signal:controller.signal}),{name:'AbortError'});assert.equal(stops,2);
 }finally{if(oldNavigator)Object.defineProperty(globalThis,'navigator',oldNavigator);else delete globalThis.navigator;if(oldWindow)globalThis.window=oldWindow;else delete globalThis.window}
});
