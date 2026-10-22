import {pitchAt,getInstrument} from './model.mjs';

// Immutable document/stroke identities are the invalidation boundary. Live input
// is sampled separately, so an in-progress mutable stroke never enters this cache.
const strokeCache = new WeakMap();
// Retain only four compiled documents, even when a large library stays mounted.
const documentCache = new Map();
export function sampleStroke(stroke, doc) {
  const count = doc.bars * 4 * doc.division;
  const key = `${count}:${doc.root}:${doc.scale}`;
  const cached = strokeCache.get(stroke);
  if (cached?.key === key) return cached.samples;
  const samples = Array.from({length: count}, () => []);
  const seenY = Array.from({length: count}, () => []);
  const add = (step, y) => {
    const ys = samples[step];
    if (ys.length >= 4) return;
    if (!seenY[step].some(v => Math.abs(v - y) < .035)) ys.push(y);
    seenY[step].push(y);
  };
  const points = stroke.points;
  if (points.length === 1) {
    add(Math.min(count-1,Math.floor(points[0].x*count)), points[0].y);
  }
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    if (a.x === b.x) {
      const step = Math.round(a.x * count - .5);
      if (step >= 0 && step < count && Math.abs(a.x - (step + .5) / count) < .00001)
        add(step, (a.y + b.y) / 2);
      continue;
    }
    const low = Math.min(a.x, b.x), high = Math.max(a.x, b.x);
    const first = Math.max(0, Math.floor(low * count - .5));
    const last = Math.min(count - 1, Math.floor(high * count - .5));
    for (let step = first; step <= last; step++) {
      const x = (step + .5) / count;
      // Keep the original half-open segment rule at floating-point boundaries.
      if (x >= low && x < high) add(step, a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
    }
  }
  const result = samples.map(ys => {
    const seen = new Set();
    return ys.flatMap(y => {
      const midi = pitchAt(y, doc);
      if (seen.has(midi)) return [];
      seen.add(midi);
      return [{midi, y}];
    });
  });
  strokeCache.set(stroke, {key, samples: result});
  return result;
}
export function getScoreIndex(doc) {
  const cached = documentCache.get(doc);
  if (cached) {documentCache.delete(doc);documentCache.set(doc, cached);return cached;}
  const count = doc.bars * 4 * doc.division;
  const steps = Array.from({length: count}, () => []);
  const tracks = new Map(doc.tracks.map(t => [t.id, t]));
  const solo = doc.tracks.some(t => t.solo);
  for (const stroke of doc.strokes) {
    const track = tracks.get(stroke.track);
    if (!track || track.muted || (solo && !track.solo)) continue;
    const instrument=stroke.instrument || track.instrument, percussion=getInstrument(instrument)?.percussion;
    sampleStroke(stroke, doc).forEach((samples, step) => {
      for (const sample of percussion ? samples.slice(0,1) : samples) {
        if (steps[step].length === 32) break;
        steps[step].push({...sample, midi:percussion ?? sample.midi, instrument, volume: track.volume,
          color: stroke.color, x: (step + .5) / count, stroke: stroke.id});
      }
    });
  }
  const index = {steps, noteCount: steps.reduce((sum, notes) => sum + notes.length, 0)};
  documentCache.set(doc, index);
  if (documentCache.size > 4) documentCache.delete(documentCache.keys().next().value);
  return index;
}
