// Reference-score retrieval and subsequence DTW. Similarity is a measured feature
// agreement, not a calibrated probability that a song title is correct.
export const FEATURE_FPS = 4;
const unit = (v) => {
  const n = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  return n > 1e-8 ? v.map((x) => x / n) : v.map(() => 0);
};
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
export function featuresFromNotes(notes, duration) {
  const frames = Array.from(
    { length: Math.ceil(duration * FEATURE_FPS) },
    (_, i) => ({
      time: (i + 0.5) / FEATURE_FPS,
      values: Array(12).fill(0),
      energy: 0,
    }),
  );
  for (const n of notes) {
    for (
      let i = Math.max(0, Math.floor(n.start * FEATURE_FPS));
      i < Math.min(frames.length, Math.ceil(n.end * FEATURE_FPS));
      i++
    ) {
      const overlap =
        Math.max(
          0,
          Math.min(n.end, (i + 1) / FEATURE_FPS) -
            Math.max(n.start, i / FEATURE_FPS),
        ) * FEATURE_FPS;
      const v = overlap * Math.max(0.2, n.confidence ?? 1);
      frames[i].values[n.pitch % 12] = Math.max(
        frames[i].values[n.pitch % 12],
        v,
      );
      frames[i].energy = Math.max(frames[i].energy, v);
    }
  }
  return frames.map((f) => ({ ...f, values: unit(f.values) }));
}
export function featuresFromModel(frames, duration) {
  const result = Array.from(
    { length: Math.ceil(duration * FEATURE_FPS) },
    (_, i) => ({
      time: (i + 0.5) / FEATURE_FPS,
      values: Array(12).fill(0),
      energy: 0,
    }),
  );
  const windowOffset = (256 / 22050) * (172 - (44100 - 256) / 256) + 0.0018;
  frames.forEach((frame, index) => {
    const time = (index * 256) / 22050 - windowOffset * Math.floor(index / 172),
      bucket = Math.floor(time * FEATURE_FPS);
    if (bucket < 0 || bucket >= result.length) return;
    const f = result[bucket];
    frame.forEach((p, k) => {
      const value = Math.max(0, p - 0.12);
      f.values[(k + 21) % 12] = Math.max(f.values[(k + 21) % 12], value);
      f.energy = Math.max(f.energy, value);
    });
  });
  return result.map((f) => ({ ...f, values: unit(f.values) }));
}
export function scoreFrames(score) {
  const count = Math.min(10000, Math.ceil(score.beats * 2) + 1),
    frames = Array.from({ length: count }, () => Array(12).fill(0));
  for (const n of score.events) {
    for (
      let i = Math.max(0, Math.floor(n.beat * 2));
      i <
      Math.min(
        count,
        Math.max(
          Math.floor(n.beat * 2) + 1,
          Math.ceil((n.beat + n.length) * 2),
        ),
      );
      i++
    )
      frames[i][n.pitch % 12] = Math.max(frames[i][n.pitch % 12], 1);
  }
  return frames.map(unit);
}
function trim(features) {
  let first = features.findIndex((f) => f.energy > 0.07),
    last = features.length - 1;
  while (last >= 0 && features[last].energy <= 0.07) last--;
  if (first < 0) return [];
  return features.slice(first, last + 1);
}
export function melodyGrams(notes) {
  const groups = new Map();
  for (const n of notes) {
    if ((n.confidence ?? 1) < 0.25) continue;
    const k = Math.round((n.start ?? n.beat) * 10);
    groups.set(k, Math.max(n.pitch, groups.get(k) || 0));
  }
  const seq = [...groups]
    .sort((a, b) => a[0] - b[0])
    .map((x) => x[1])
    .filter((p, i, a) => i === 0 || p !== a[i - 1]);
  const ints = seq.slice(1).map((p, i) => (p - seq[i] + 120) % 12);
  return new Set(
    ints.slice(2).map((_, i) => ints[i] * 144 + ints[i + 1] * 12 + ints[i + 2]),
  );
}
export function rankCatalog(analysis, items, limit = 26) {
  const frames = trim(
    analysis.features || featuresFromNotes(analysis.notes, analysis.duration),
  );
  if (frames.filter((f) => f.energy > 0.07).length < 10) return [];
  const hist = unit(
      frames.reduce(
        (a, f) => a.map((v, i) => v + f.values[i]),
        Array(12).fill(0),
      ),
    ),
    grams = melodyGrams(analysis.notes || []);
  const ranked = items.map((item) => {
    const rotations = Array.from({ length: 12 }, (_, s) => ({
      shift: s > 6 ? s - 12 : s,
      similarity: hist.reduce(
        (v, x, i) => v + x * item.hist[(i - s + 12) % 12],
        0,
      ),
    })).sort((a, b) => b.similarity - a.similarity);
    const shared = (item.grams || []).filter((g) => grams.has(g)).length;
    const gramScore =
      shared / Math.max(1, Math.min(grams.size, (item.grams || []).length));
    return {
      item,
      shifts: [...new Set([0, ...rotations.slice(0, 2).map((r) => r.shift)])],
      rank: 0.66 * rotations[0].similarity + 0.34 * gramScore,
      gramScore,
    };
  });
  return ranked.sort((a, b) => b.rank - a.rank).slice(0, limit);
}
export function alignFeatures(analysis, score, shift = 0) {
  const query = trim(
      analysis.features || featuresFromNotes(analysis.notes, analysis.duration),
    ),
    ref = scoreFrames(score),
    n = query.length,
    m = ref.length;
  if (n < 10 || m < 5) return null;
  const rotated = ref.map((v) => v.map((_, i) => v[(i - shift + 12) % 12]));
  let prev = new Float32Array(m + 1),
    curr = new Float32Array(m + 1);
  const trace = new Uint8Array((n + 1) * (m + 1));
  for (let i = 1; i <= n; i++) {
    curr.fill(Infinity);
    const q = query[i - 1];
    for (let j = 1; j <= m; j++) {
      const r = rotated[j - 1],
        qSound = q.energy > 0.07,
        rSound = r.some((x) => x > 0);
      const cost = !qSound
        ? !rSound
          ? 0
          : 0.5
        : !rSound
          ? 0.85
          : 1 - dot(q.values, r);
      let best = prev[j - 1],
        direction = 1;
      const hold = prev[j] + 0.075;
      if (hold < best) {
        best = hold;
        direction = 2;
      }
      const skip = curr[j - 1] + 0.09;
      if (skip < best) {
        best = skip;
        direction = 3;
      }
      curr[j] = best + Math.max(0, cost);
      trace[i * (m + 1) + j] = direction;
    }
    [prev, curr] = [curr, prev];
  }
  const ends = Array.from({ length: m }, (_, i) => i + 1).sort(
    (a, b) => prev[a] - prev[b],
  );
  for (const end of ends.slice(0, 12)) {
    let i = n,
      j = end;
    const pairs = [];
    while (i > 0 && j > 0) {
      pairs.push([i - 1, j - 1]);
      const d = trace[i * (m + 1) + j];
      if (d === 1) {
        i--;
        j--;
      } else if (d === 2) i--;
      else if (d === 3) j--;
      else break;
    }
    if (i !== 0) continue;
    pairs.reverse();
    const span = pairs.at(-1)[1] - pairs[0][1];
    if (span < Math.max(3, n * 0.17)) continue;
    const cost = prev[end] / n,
      similarity = Math.max(0, Math.min(1, 1 - cost));
    const buckets = new Map();
    for (const [qi, rj] of pairs) {
      const a = buckets.get(rj) || [];
      a.push(query[qi].time);
      buckets.set(rj, a);
    }
    const anchors = [...buckets].map(([rj, times]) => ({
      beat: rj / 2,
      time: times.reduce((a, b) => a + b, 0) / times.length,
    }));
    return {
      similarity,
      shift,
      startBeat: anchors[0].beat,
      endBeat: anchors.at(-1).beat,
      anchors,
      voicedFrames: query.filter((f) => f.energy > 0.07).length,
    };
  }
  return null;
}
function interpolate(anchors, beat) {
  if (anchors.length < 2) return anchors[0]?.time || 0;
  let lo = 0,
    hi = anchors.length - 1;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (anchors[mid].beat <= beat) lo = mid;
    else hi = mid;
  }
  if (beat <= anchors[0].beat) {
    lo = 0;
    hi = 1;
  } else if (beat >= anchors.at(-1).beat) {
    lo = anchors.length - 2;
    hi = anchors.length - 1;
  }
  const a = anchors[lo],
    b = anchors[hi];
  return (
    a.time +
    ((beat - a.beat) / Math.max(0.0001, b.beat - a.beat)) * (b.time - a.time)
  );
}
export function alignScoreNotes(analysis, score, alignment) {
  if (!alignment || alignment.similarity < 0.58)
    throw Error("这个曲谱版本与录音差异较大，请选择其他版本；不会自动套用。");
  const duration = analysis.duration,
    notes = [],
    raw = analysis.notes || [];
  for (const event of score.events) {
    if (
      event.beat + event.length < alignment.startBeat ||
      event.beat > alignment.endBeat + 0.5
    )
      continue;
    const pitch = event.pitch + alignment.shift;
    if (pitch < 21 || pitch > 108) continue;
    let start = interpolate(alignment.anchors, event.beat),
      end = interpolate(alignment.anchors, event.beat + event.length);
    if (end <= 0 || start >= duration || start < -0.8) continue;
    const observed = raw
      .filter(
        (n) =>
          n.pitch === pitch &&
          Math.abs(n.start - start) < 0.22 &&
          (n.confidence ?? 0) > 0.35,
      )
      .sort((a, b) => Math.abs(a.start - start) - Math.abs(b.start - start))[0];
    if (observed) {
      const delta = observed.start - start;
      start = observed.start;
      if (Math.abs(observed.end - end) < 0.25) end = observed.end;
      else end += delta * 0.25;
    }
    start = Math.max(0, start);
    end = Math.min(duration, Math.max(start + 0.045, end));
    if (end <= start) continue;
    notes.push({
      id: "score-" + notes.length,
      pitch,
      start: Math.round(start * 1000) / 1000,
      end: Math.round(end * 1000) / 1000,
      confidence: observed
        ? Math.min(1, observed.confidence)
        : alignment.similarity,
      sourceBeat: event.beat,
      durationBeats: event.length,
      measure: event.measure,
      staff: event.staff,
      review: !observed,
    });
  }
  if (!notes.length)
    throw Error("没有得到有效的曲谱时间对应，请选择其他版本。");
  return notes.sort((a, b) => a.start - b.start || a.pitch - b.pitch);
}
export function describeMatch(score, fit) {
  return {
    id: score.id,
    title: score.title,
    composer: score.composer,
    version: score.version,
    kind: score.kind || "score",
    source: score.source,
    sourceName: score.sourceName,
    noteCount: score.noteCount,
    timeSignature: score.timeSignature,
    keyFifths: score.keyFifths,
    similarity: fit ? Math.round(fit.similarity * 1000) / 1000 : 0,
    shift: fit?.shift || 0,
    startBeat: fit?.startBeat ?? 0,
    endBeat: fit?.endBeat ?? 0,
    level:
      fit && fit.similarity >= 0.76
        ? "strong"
        : fit && fit.similarity >= 0.58
          ? "possible"
          : "weak",
  };
}
export function fitRegister(analysis, score, fit) {
  if (!fit) return null;
  const events = score.events
      .filter((n) => n.beat >= fit.startBeat && n.beat <= fit.endBeat)
      .slice(0, 100),
    raw = analysis.notes || [];
  if (!events.length) return fit;
  const scoreAt = (octave) =>
    events.reduce((sum, event) => {
      const time = interpolate(fit.anchors, event.beat),
        pitch = event.pitch + fit.shift + octave;
      const near = raw.filter(
        (n) => n.pitch === pitch && Math.abs(n.start - time) < 0.3,
      );
      return (
        sum +
        (near.length ? Math.max(...near.map((n) => n.confidence || 0.5)) : 0)
      );
    }, 0) / events.length;
  const base = scoreAt(0);
  let best = base,
    octave = 0;
  for (const shift of [-24, -12, 12, 24]) {
    const value = scoreAt(shift);
    if (value > best + 0.12) {
      best = value;
      octave = shift;
    }
  }
  return { ...fit, shift: fit.shift + octave };
}
