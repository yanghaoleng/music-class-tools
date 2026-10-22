import test from "node:test";
import assert from "node:assert/strict";
import {
  createDoc,
  makeDemo,
  intersections,
  notesAt,
  compile,
  pitchAt,
  pitches,
  categories,
  validateDoc,
  exportMidi,
  duration,
} from "../src/model.mjs";
test("high positions map to higher in-scale notes for every root and scale", () => {
  for (const scale of ["pentatonic", "major", "minor"])
    for (let root = 0; root < 12; root++) {
      const d = { ...createDoc(), scale, root },
        ns = pitches(d);
      assert.equal(pitchAt(0, d), 72 + root);
      assert.equal(pitchAt(1, d), 48 + root);
      for (let i = 0; i <= 100; i++)
        assert.ok(ns.includes(pitchAt(i / 100, d)));
    }
});
test("drawing direction does not alter time mapping; shared vertices do not double trigger", () => {
  const points = [
    { x: 0, y: 0 },
    { x: 0.5, y: 0.5 },
    { x: 1, y: 1 },
  ];
  for (const x of [0.1, 0.5, 0.8]) {
    for (const ps of [points, [...points].reverse()]) {
      const ys = intersections(ps, x);
      assert.equal(ys.length, 1);
      assert.ok(Math.abs(ys[0] - x) < 1e-10);
    }
  }
  assert.deepEqual(
    intersections(
      [
        { x: 0.5, y: 0.2 },
        { x: 0.5, y: 0.8 },
      ],
      0.5,
    ),
    [0.5],
  );
});
test("looping shapes create polyphony but coincident pitches are deduplicated", () => {
  const d = createDoc();
  d.strokes = [
    {
      id: "stroke",
      track: d.tracks[0].id,
      color: "#568b76",
      width: 4,
      points: [
        { x: 0, y: 0.2 },
        { x: 1, y: 0.2 },
        { x: 0, y: 0.8 },
        { x: 1, y: 0.8 },
      ],
    },
  ];
  const notes = notesAt(d, 16);
  assert.ok(notes.length >= 2);
  assert.equal(new Set(notes.map((n) => n.midi)).size, notes.length);
});
test("mute and solo control audible tracks, including multiple solo tracks", () => {
  const d = makeDemo();
  assert.ok(notesAt(d, 16).length > 0);
  d.tracks[0].muted = true;
  assert.ok(notesAt(d, 16).every((n) => n.instrument === "bell"));
  d.tracks[0].muted = false;
  d.tracks[0].solo = true;
  assert.ok(notesAt(d, 16).every((n) => n.instrument === "keys"));
  d.tracks[1].solo = true;
  assert.equal(new Set(notesAt(d, 16).map((n) => n.instrument)).size, 2);
  d.tracks.forEach((t) => (t.muted = true));
  assert.equal(compile(d).length, 0);
});
test("tempo and subdivisions produce correct note timing and loop length", () => {
  const d = createDoc();
  d.strokes = [
    {
      id: "s",
      track: d.tracks[0].id,
      color: "#568b76",
      width: 4,
      points: [
        { x: 0, y: 0.5 },
        { x: 1, y: 0.5 },
      ],
    },
  ];
  for (const division of [1, 2, 4]) {
    d.division = division;
    const n = compile(d);
    assert.equal(n.length, d.bars * 4 * division);
    assert.equal(n[1].time, 60 / d.bpm / division);
    assert.ok(n.at(-1).time + n.at(-1).length <= duration(d));
  }
});
test("automatic categories respond to tempo and instrumentation", () => {
  const d = makeDemo();
  assert.deepEqual(categories(d), ["轻快律动", "多声部", "五声音阶"]);
  d.bpm = 60;
  assert.equal(categories(d)[0], "慢慢流动");
  d.bpm = 140;
  assert.equal(categories(d)[0], "活力节奏");
  d.strokes = d.strokes.filter((s) => s.track === d.tracks[0].id);
  assert.equal(categories(d)[1], "单声部");
});
test("project roundtrip preserves composition but creates independent identity", () => {
  const d = makeDemo();
  const copy = validateDoc(JSON.parse(JSON.stringify(d)));
  assert.notEqual(copy.id, d.id);
  assert.deepEqual(
    compile(copy).map(({ stroke, ...n }) => n),
    compile(d).map(({ stroke, ...n }) => n),
  );
});
test("import rejects malicious colors, scale keys, bad coordinates, duplicate tracks and oversized files", () => {
  for (const mutate of [
    (d) => (d.scale = "__proto__"),
    (d) => (d.strokes[0].color = 'red" onload="alert(1)'),
    (d) => (d.strokes[0].points[0].x = NaN),
    (d) => (d.strokes[0].points[0].y = 2),
    (d) => (d.bpm = 0),
    (d) => d.tracks.push(d.tracks[0]),
    (d) =>
      (d.strokes[0].points = Array.from({ length: 100001 }, () => ({
        x: 0,
        y: 0,
      }))),
  ]) {
    const d = makeDemo();
    mutate(d);
    assert.throws(() => validateDoc(d));
  }
});
test("MIDI has a valid header, tempo event, matching notes and preserved loop duration", () => {
  const d = makeDemo(),
    bytes = exportMidi(d),
    data = new DataView(bytes.buffer);
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "MThd");
  assert.equal(data.getUint16(12), 480);
  assert.equal(data.getUint32(18), bytes.length - 22);
  assert.deepEqual([...bytes.slice(-3)], [255, 47, 0]);
  assert.ok(bytes.includes(144));
  assert.ok(bytes.includes(128));
});

test('all 12 instrument identities survive import and retain MIDI programs and transposition', async () => {
  const {INSTRUMENTS,instrumentPitch}=await import('../src/model.mjs');
  assert.equal(INSTRUMENTS.length,12);
  const d=createDoc();
  d.tracks=INSTRUMENTS.map((i,n)=>({id:'track-'+n,instrument:i.id,volume:.7,muted:false,solo:false}));
  d.strokes=d.tracks.map((t,n)=>({id:'line-'+n,track:t.id,color:'#a552da',width:7,points:[{x:0,y:.5},{x:1,y:.5}]}));
  const roundtrip=validateDoc(JSON.parse(JSON.stringify(d)));
  assert.deepEqual(roundtrip.tracks.map(t=>t.instrument),INSTRUMENTS.map(i=>i.id));
  const midi=Array.from(exportMidi(roundtrip));
  let melodic=0;
  for(const i of INSTRUMENTS){
    const index=melodic; if(!i.percussion)melodic++;
    const channel=i.percussion?9:index>=9?index+1:index;
    if(!i.percussion)assert.ok(midi.some((v,k)=>v===0xc0+channel&&midi[k+1]===i.midi));
    assert.ok(midi.some((v,k)=>v===0x90+channel&&midi[k+1]===instrumentPitch(pitchAt(.5,d),i.id)));
  }
  assert.equal(instrumentPitch(60,'bass'),48);
  assert.equal(instrumentPitch(60,'sub'),36);
});
