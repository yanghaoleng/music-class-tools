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

test('MIDI exports all twelve colors in one layer to distinct non-percussion programs',()=>{
  const d=createDoc();d.strokes=INSTRUMENTS.map(i=>({id:i.id,track:d.tracks[0].id,instrument:i.id,color:i.color,width:3,points:[{x:0,y:.4},{x:1,y:.4}]}));
  const bytes=exportMidi(d),programs=new Map(),notes=new Set();let p=22;
  while(p<bytes.length){
    let delta;do{delta=bytes[p++];}while(delta&128);
    const status=bytes[p++];
    if(status===255){p++;const size=bytes[p++];p+=size;continue;}
    const channel=status&15,type=status>>4;
    if(type===12){programs.set(channel,bytes[p++]);continue;}
    if(type===9)notes.add(channel);p+=2;
  }
  assert.equal(programs.size,12);assert.equal(notes.size,12);assert.ok(!notes.has(9));
  assert.deepEqual([...programs.values()],INSTRUMENTS.map(i=>i.midi));
});
