import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoc} from '../src/model.mjs';
import {beginHistory,recordHistory,packHistory,unpackHistory,nextHistory,historyTitle} from '../src/history.mjs';
const stroke=(doc,n)=>({id:'s'+n,track:doc.tracks[0].id,instrument:'keys',color:'#e34b4b',width:3,points:[{x:.1,y:.2},{x:.8,y:.3}]});
test('snapshots keep alternate futures, restore every operation and share immutable pigment',()=>{
  const doc=createDoc();let h=beginHistory(doc);
  h=recordHistory(h,{...doc,strokes:[stroke(doc,1)]});
  h=recordHistory(h,{...h.entries[1].doc,bpm:120});
  h={...h,cursor:1};assert.equal(nextHistory(h),2);
  h=recordHistory(h,{...h.entries[1].doc,strokes:[...h.entries[1].doc.strokes,stroke(doc,2)]});
  assert.equal(h.entries.length,4);assert.equal(h.entries[3].parent,1);
  assert.equal(h.entries[2].doc.bpm,120,'old future is retained');
  const packed=packHistory(h);assert.equal(packed.pool.length,2,'stroke points stored only once');
  const roundtrip=unpackHistory(JSON.parse(JSON.stringify(packed)),doc);
  assert.equal(roundtrip.cursor,3);assert.equal(roundtrip.entries[2].doc.bpm,120);
  assert.equal(roundtrip.entries[1].doc.strokes[0],roundtrip.entries[3].doc.strokes[0]);
  assert.deepEqual(roundtrip.entries.map(e=>e.doc.strokes.length),[0,1,1,2]);
});
test('one erase gesture merges into one undoable snapshot and corrupt history cannot replace artwork',()=>{
  let doc=createDoc();doc={...doc,strokes:[stroke(doc,1),stroke(doc,2),stroke(doc,3)]};
  let h=beginHistory(doc);h=recordHistory(h,{...doc,strokes:doc.strokes.slice(1)});
  h=recordHistory(h,{...doc,strokes:doc.strokes.slice(2)},{merge:true});
  assert.equal(h.entries.length,2);assert.equal(h.entries[0].doc.strokes.length,3);
  const packed=packHistory(h);packed.entries[1].doc.strokes=[999];
  assert.equal(unpackHistory(packed,doc),null);
});

test('snapshot titles identify the stroke instrument and its own voice, including old saved branches and erasures',()=>{
  const doc=createDoc();let h=beginHistory(doc);
  assert.equal(historyTitle(h.entries[0]),'空白画布');
  const first=stroke(doc,1);
  h=recordHistory(h,{...doc,strokes:[first]});
  assert.equal(historyTitle(h.entries[1],h.entries[0]),'柔和电钢 · 声部 1');
  const secondTrack={...doc.tracks[0],id:'second'};
  h=recordHistory(h,{...h.entries[1].doc,tracks:[...doc.tracks,secondTrack]});
  const kick={...stroke(doc,2),track:'second',instrument:'kick'};
  h=recordHistory(h,{...h.entries[2].doc,strokes:[first,kick]});
  assert.equal(historyTitle(h.entries[3],h.entries[2]),'低沉底鼓 · 声部 2');
  h=recordHistory(h,{...h.entries[3].doc,strokes:[first]});
  assert.equal(historyTitle(h.entries[4],h.entries[3]),'低沉底鼓 · 声部 2','erasing identifies the removed stroke, not the remaining one');
  const restored=unpackHistory(JSON.parse(JSON.stringify(packHistory(h))),doc);
  assert.equal(historyTitle(restored.entries[3],restored.entries[2]),'低沉底鼓 · 声部 2','already saved operation labels are displayed with the derived instrument title');
  h={...h,cursor:1};h=recordHistory(h,{...h.entries[1].doc,strokes:[first,{...stroke(doc,3),instrument:'cymbal'}]});
  assert.equal(historyTitle(h.entries.at(-1),h.entries[1]),'金属镲片 · 声部 1');
});
