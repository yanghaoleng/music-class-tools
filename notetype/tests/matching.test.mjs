import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alignFeatures,
  alignScoreNotes,
  featuresFromNotes,
  rankCatalog,
  describeMatch,
} from "../server/matching.mjs";
function score(pitches) {
  return {
    id: "test",
    title: "fixture",
    events: pitches.map((pitch, i) => ({
      pitch,
      beat: i,
      length: 0.8,
      staff: 1,
      measure: String(1 + Math.floor(i / 4)),
    })),
    beats: pitches.length,
    hist: Array.from(
      { length: 12 },
      (_, k) => pitches.filter((p) => p % 12 === k).length,
    ),
  };
}
function performance(
  ref,
  {
    shift = 0,
    from = 0,
    count = ref.events.length,
    warp = (i) => 0.4 + i * 0.6,
  } = {},
) {
  const notes = ref.events
    .slice(from, from + count)
    .map((n, i) => ({
      id: String(i),
      pitch: n.pitch + shift,
      start: warp(i),
      end: warp(i) + 0.3,
      confidence: 0.9,
    }));
  const duration = notes.at(-1).end + 0.3;
  return { notes, duration, features: featuresFromNotes(notes, duration) };
}
const tune = score([
  64, 63, 64, 63, 64, 59, 62, 60, 57, 48, 52, 57, 59, 52, 56, 59, 60, 52, 64,
  63, 64, 63, 64, 59, 62, 60, 57, 48, 52, 57,
]);
test("aligns an excerpt with changing tempo instead of stretching the whole recording", () => {
  const a = performance(tune, {
    from: 6,
    count: 18,
    warp: (i) => 0.45 + i * 0.5 + i * i * 0.005,
  });
  const fit = alignFeatures(a, tune);
  assert.ok(fit?.similarity > 0.75, JSON.stringify(fit));
  assert.ok(Math.abs(fit.startBeat - 6) < 1.5);
  const notes = alignScoreNotes(a, tune, fit);
  assert.ok(notes.length >= 15);
  assert.ok(
    notes.every((n) => n.start >= 0 && n.end <= a.duration && n.end > n.start),
  );
  const observed = a.notes.find((n) => n.pitch === 57);
  assert.ok(
    notes.some(
      (n) => n.pitch === 57 && Math.abs(n.start - observed.start) < 0.15,
    ),
  );
});
test("supports transposition and keeps correct reference pitches", () => {
  const a = performance(tune, { shift: 2, count: 20 });
  const fit = alignFeatures(a, tune, 2);
  assert.ok(fit.similarity > 0.8);
  const notes = alignScoreNotes(a, tune, fit);
  assert.equal(notes[0].pitch, 66);
});
test("tolerates a missed note and an extra note", () => {
  const a = performance(tune, { count: 22 });
  a.notes.splice(8, 1);
  a.notes.push({
    id: "noise",
    pitch: 77,
    start: 5.22,
    end: 5.4,
    confidence: 0.7,
  });
  a.features = featuresFromNotes(a.notes, a.duration);
  const fit = alignFeatures(a, tune);
  assert.ok(fit.similarity > 0.7, fit.similarity);
});
test("does not treat short or silent clips as identified songs", () => {
  const a = {
    notes: [{ pitch: 60, start: 0, end: 0.3, confidence: 1 }],
    duration: 1,
  };
  assert.deepEqual(rankCatalog(a, [tune]), []);
  assert.equal(alignFeatures(a, tune), null);
});
test("rejects a poor reference instead of manufacturing a match", () => {
  assert.throws(
    () =>
      alignScoreNotes(performance(tune), tune, {
        similarity: 0.35,
        shift: 0,
        anchors: [],
      }),
    /差异较大/,
  );
});
test("labels weak matches as candidates, not confident identification", () => {
  assert.equal(describeMatch(tune, { similarity: 0.4 }).level, "weak");
  assert.equal(describeMatch(tune, { similarity: 0.8 }).level, "strong");
});
