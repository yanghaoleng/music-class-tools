import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoc,INSTRUMENTS,COLORS,notesAt,validateDoc,exportMidi} from '../src/model.mjs';
import {getScoreIndex} from '../src/score-index.mjs';

test('quarter-beat is the default and twelve unique rainbow colors are paired to instruments',()=>{
  assert.equal(createDoc().division,4);
  assert.equal(new Set(COLORS).size,12);
  assert.deepEqual(INSTRUMENTS.map(i=>i.color),COLORS);
});

test('each painted line retains its instrument through playback, cache and project roundtrip',()=>{
  const d=createDoc();
  d.strokes=INSTRUMENTS.map(i=>({id:i.id,track:d.tracks[0].id,instrument:i.id,color:i.color,width:3,
    points:[{x:0,y:.4},{x:1,y:.4}]}));
  assert.deepEqual(notesAt(d,0).map(n=>n.instrument),INSTRUMENTS.map(i=>i.id));
  assert.deepEqual(getScoreIndex(d).steps[0],notesAt(d,0));
  const imported=validateDoc(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(imported.strokes.map(s=>[s.instrument,s.color,s.width]),d.strokes.map(s=>[s.instrument,s.color,3]));
  const changed={...d,tracks:d.tracks.map(t=>({...t,instrument:'sub'}))};
  assert.deepEqual(notesAt(changed,0).map(n=>n.instrument),INSTRUMENTS.map(i=>i.id),'new brush does not rewrite old notes');
  assert.throws(()=>validateDoc({...d,strokes:[{...d.strokes[0],instrument:'invalid'}]}));
  // A legacy line still resolves to its layer's original sound and keeps its old color/width.
  const legacy={...d,division:2,strokes:[{...d.strokes[0],instrument:undefined,color:'#a552da',width:7}]};
  const legacyImport=validateDoc(JSON.parse(JSON.stringify(legacy)));
  assert.equal(legacyImport.division,2);assert.equal(legacyImport.strokes[0].width,7);
  assert.equal(legacyImport.strokes[0].color,'#a552da');assert.equal(notesAt(legacyImport,0)[0].instrument,'keys');
});

test('MIDI exports ten melodic voices and two drum notes on the standard percussion channel',()=>{
  const d=createDoc();d.strokes=INSTRUMENTS.map(i=>({id:i.id,track:d.tracks[0].id,instrument:i.id,color:i.color,width:3,points:[{x:0,y:.4},{x:1,y:.4}]}));
  const bytes=exportMidi(d),programs=new Map(),notes=new Set(),drums=new Set();let p=22;
  while(p<bytes.length){
    let delta;do{delta=bytes[p++];}while(delta&128);
    const status=bytes[p++];
    if(status===255){p++;const size=bytes[p++];p+=size;continue;}
    const channel=status&15,type=status>>4;
    if(type===12){programs.set(channel,bytes[p++]);continue;}
    if(type===9){notes.add(channel);if(channel===9)drums.add(bytes[p]);}p+=2;
  }
  assert.equal(programs.size,10);assert.equal(notes.size,11);assert.ok(notes.has(9));
  assert.deepEqual([...drums].sort((a,b)=>a-b),[36,51]);assert.ok(!programs.has(9));
  assert.deepEqual([...programs.values()],INSTRUMENTS.filter(i=>!i.percussion).map(i=>i.midi));
});

test('archived analog and glass drawings retain original sounds after drum brushes replace them',()=>{
  const d=createDoc();d.tracks[0].instrument='analog';
  d.strokes=[{id:'old',track:d.tracks[0].id,instrument:'glass',color:'#426bd4',width:3,points:[{x:0,y:.2},{x:1,y:.2}]}];
  const imported=validateDoc(d);assert.equal(imported.tracks[0].instrument,'analog');assert.equal(notesAt(imported,0)[0].instrument,'glass');
  assert.ok(exportMidi(imported).length>30);
});
test('drum crossings trigger once per stroke and cached scheduling matches the sampler',()=>{
  const d=createDoc();d.strokes=['kick','cymbal'].map((instrument,n)=>({id:'drum'+n,track:d.tracks[0].id,instrument,color:COLORS[n],width:3,
    points:[{x:0,y:.2},{x:1,y:.2},{x:0,y:.8},{x:1,y:.8}]}));
  for(let step=0;step<d.bars*4*d.division;step++){
    const notes=notesAt(d,step);assert.deepEqual(notes.map(n=>n.midi),[36,51]);assert.deepEqual(getScoreIndex(d).steps[step],notes);
  }
});
