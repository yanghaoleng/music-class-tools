import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoc} from '../src/model.mjs';
import {beginHistory,recordHistory,packHistory,unpackHistory,nextHistory} from '../src/history.mjs';
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
