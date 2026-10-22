import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoc,notesAt,validateDoc} from '../src/model.mjs';
import {getScoreIndex} from '../src/score-index.mjs';
test('a round tap triggers exactly one quantized note, including bar boundaries and restored drawings',()=>{
  for(const bars of [2,4,8])for(const division of [1,2,4])for(const x of [0,.001,.4999,.5,.9999,1]){
    const doc={...createDoc(),bars,division};
    doc.strokes=[{id:'tap',track:doc.tracks[0].id,instrument:'keys',color:'#e34b4b',width:9,points:[{x,y:.4}]}];
    const restored=validateDoc(JSON.parse(JSON.stringify(doc))),index=getScoreIndex(restored);
    assert.equal(restored.strokes[0].points.length,1);assert.equal(restored.strokes[0].width,9);
    assert.equal(index.noteCount,1);
    assert.equal(index.steps.findIndex(ns=>ns.length),Math.min(bars*4*division-1,Math.floor(x*bars*4*division)));
    for(let step=0;step<index.steps.length;step++)assert.deepEqual(index.steps[step],notesAt(restored,step));
  }
});
