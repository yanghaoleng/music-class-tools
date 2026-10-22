import test from 'node:test';
import assert from 'node:assert/strict';
import {createDoc, notesAt, COLORS} from '../src/model.mjs';
import {getScoreIndex} from '../src/score-index.mjs';

test('indexed score matches the original sampler for crossings, reverse lines, verticals, dots, scales and polyphony', () => {
  let seed = 74;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) | 0) >>> 0) / 4294967296;
  for (const division of [1, 2, 4]) for (const scale of ['pentatonic', 'major', 'minor']) {
    const d = {...createDoc(), division, scale, root: 7};
    d.strokes = Array.from({length: 18}, (_, j) => ({id:'s'+j,track:d.tracks[0].id,color:COLORS[j%6],width:7,
      points: Array.from({length: 30}, () => ({x:random(), y:random()}))}));
    d.strokes.unshift(...[
      [{x:.5,y:.1},{x:.5,y:.9}], [{x:.51,y:.2}], [{x:1,y:1},{x:0,y:0}],
      [{x:.2,y:.1},{x:.4,y:.9},{x:.2,y:.8},{x:.9,y:.1}],
    ].map((points,i)=>({id:'edge'+i,track:d.tracks[0].id,color:COLORS[0],width:3,points})));
    const index = getScoreIndex(d);
    for(let step=0;step<d.bars*4*division;step++) assert.deepEqual(index.steps[step],notesAt(d,step));
    assert.equal(index.noteCount,index.steps.flat().length);
  }
});

test('edits, undo, mute, solo, volume and pitch rules invalidate only the relevant immutable cache', () => {
  const d=createDoc(); d.tracks.push({...d.tracks[0],id:'bass',instrument:'sub'});
  d.strokes=d.tracks.map((t,i)=>({id:'line'+i,track:t.id,color:COLORS[i],width:7,points:[{x:0,y:.4},{x:1,y:.4}]}));
  assert.equal(getScoreIndex(d),getScoreIndex(d));
  for(const next of [
    {...d,strokes:d.strokes.slice(1)},
    {...d,tracks:d.tracks.map((t,i)=>i?{...t,solo:true,volume:.2}:t)},
    {...d,tracks:d.tracks.map(t=>({...t,muted:true}))},
    {...d,root:11,division:4},
  ]) for(let step=0;step<next.bars*4*next.division;step++) assert.deepEqual(getScoreIndex(next).steps[step],notesAt(next,step));
  assert.equal(getScoreIndex(d).steps[0].length,2,'original document remains intact after undo');
});
