export const COLORS = [
  "#a552da",
  "#dc4f98",
  "#8058c9",
  "#ee86ad",
  "#bd78d5",
  "#6b466d",
];
export const INSTRUMENTS = [
  {
    id: "keys",
    name: "柔和电钢",
    description: "圆润、带一点颗粒感",
    color: COLORS[0],
  },
  {
    id: "bell",
    name: "空灵钟琴",
    description: "清亮，像水滴落下",
    color: COLORS[1],
  },
  {
    id: "pluck",
    name: "拨弦",
    description: "短促，轻快的弦声",
    color: COLORS[2],
  },
  {
    id: "pad",
    name: "空气合成器",
    description: "缓慢铺开的柔软声音",
    color: COLORS[3],
  },
  {
    id: "bass",
    name: "温暖贝斯",
    description: "低一个八度，稳稳托住旋律",
    color: COLORS[4],
  },
];
export const SCALES = {
  pentatonic: { name: "五声音阶", steps: [0, 2, 4, 7, 9] },
  major: { name: "大调音阶", steps: [0, 2, 4, 5, 7, 9, 11] },
  minor: { name: "小调音阶", steps: [0, 2, 3, 5, 7, 8, 10] },
};
export const ROOTS = [
  "C",
  "C♯",
  "D",
  "D♯",
  "E",
  "F",
  "F♯",
  "G",
  "G♯",
  "A",
  "A♯",
  "B",
];
export const uid = () => globalThis.crypto.randomUUID();
export function pitches(doc) {
  const steps = SCALES[doc.scale].steps;
  return [...steps, ...steps.map((s) => s + 12), 24]
    .map((n) => n + 48 + doc.root)
    .reverse();
}
export function pitchAt(y, doc) {
  const ns = pitches(doc);
  return ns[
    Math.max(0, Math.min(ns.length - 1, Math.round(y * (ns.length - 1))))
  ];
}
export function noteName(n) {
  return ROOTS[n % 12] + (Math.floor(n / 12) - 1);
}
export function duration(doc) {
  return (doc.bars * 4 * 60) / doc.bpm;
}
export function intersections(points, x) {
  const ys = [];
  if (points.length === 1 && Math.abs(points[0].x - x) < 0.009)
    return [points[0].y];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1],
      b = points[i];
    if (a.x === b.x) {
      if (Math.abs(a.x - x) < 0.00001) ys.push((a.y + b.y) / 2);
      continue;
    }
    if (x >= Math.min(a.x, b.x) && x < Math.max(a.x, b.x))
      ys.push(a.y + ((b.y - a.y) * (x - a.x)) / (b.x - a.x));
  }
  return ys
    .filter((y, i) => ys.findIndex((v) => Math.abs(v - y) < 0.035) === i)
    .slice(0, 4);
}
export function notesAt(doc, step) {
  const count = doc.bars * 4 * doc.division;
  const x = (step + 0.5) / count;
  const solo = doc.tracks.some((t) => t.solo);
  return doc.strokes
    .flatMap((s) => {
      const t = doc.tracks.find((t) => t.id === s.track);
      if (!t || t.muted || (solo && !t.solo)) return [];
      const ys = intersections(s.points, x);
      const seen = new Set();
      return ys.flatMap((y) => {
        const midi = pitchAt(y, doc);
        if (seen.has(midi)) return [];
        seen.add(midi);
        return [
          {
            midi,
            instrument: t.instrument,
            volume: t.volume,
            color: s.color,
            x,
            y,
            stroke: s.id,
          },
        ];
      });
    })
    .slice(0, 32);
}
export function compile(doc) {
  return Array.from({ length: doc.bars * 4 * doc.division }, (_, step) =>
    notesAt(doc, step).map((n) => ({
      ...n,
      time: (step * 60) / doc.bpm / doc.division,
      length: (60 / doc.bpm / doc.division) * 0.82,
    })),
  ).flat();
}
export function categories(doc) {
  const tags = [
    doc.bpm < 85 ? "慢慢流动" : doc.bpm < 120 ? "轻快律动" : "活力节奏",
  ];
  const used = new Set(doc.strokes.map((s) => s.track));
  tags.push(used.size > 1 ? "多声部" : "单声部");
  tags.push(SCALES[doc.scale].name);
  return tags;
}
export function createDoc(title = "未命名的旋律") {
  return {
    version: 1,
    id: uid(),
    title,
    bpm: 96,
    bars: 4,
    root: 0,
    scale: "pentatonic",
    division: 2,
    tracks: [
      {
        id: uid(),
        instrument: "keys",
        volume: 0.75,
        muted: false,
        solo: false,
      },
    ],
    strokes: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}
export function makeDemo(index = 0) {
  const d = createDoc(["午后三点半", "雨落在窗边", "一场轻快的散步"][index]);
  d.bpm = [96, 72, 124][index];
  d.scale = index === 1 ? "minor" : "pentatonic";
  d.tracks.push({
    id: uid(),
    instrument: index === 1 ? "pad" : "bell",
    volume: 0.48,
    muted: false,
    solo: false,
  });
  const line = (track, color, fn, start = 0.025, end = 0.975) => ({
    id: uid(),
    track: d.tracks[track].id,
    color,
    width: 7,
    points: Array.from({ length: 160 }, (_, i) => {
      const x = start + ((end - start) * i) / 159;
      return { x, y: fn(x) };
    }),
  });
  if (index === 0)
    d.strokes = [
      line(
        0,
        COLORS[0],
        (x) => 0.43 + Math.sin(x * 9.6) * 0.17 + Math.cos(x * 22) * 0.035,
      ),
      line(
        1,
        COLORS[1],
        (x) => 0.38 + Math.cos(x * 10.5 + 1.3) * 0.16,
        0.12,
        0.88,
      ),
      line(0, COLORS[2], (x) => 0.72 + Math.sin(x * 12) * 0.065, 0.06, 0.96),
    ];
  else if (index === 1)
    d.strokes = [
      line(0, COLORS[3], (x) => 0.3 + Math.sin(x * 19) * 0.14),
      line(1, COLORS[4], (x) => 0.76 + Math.sin(x * 7) * 0.045),
    ];
  else
    d.strokes = [
      line(0, COLORS[0], (x) => 0.5 + Math.sin(x * 30) * 0.23),
      line(1, COLORS[1], (x) => 0.22 + Math.cos(x * 18) * 0.1, 0.18, 0.9),
    ];
  return d;
}
export function validateDoc(raw) {
  if (
    !raw ||
    raw.version !== 1 ||
    typeof raw.title !== "string" ||
    raw.title.length > 80 ||
    !Array.isArray(raw.strokes) ||
    raw.strokes.length > 500 ||
    !Array.isArray(raw.tracks) ||
    raw.tracks.length < 1 ||
    raw.tracks.length > 12
  )
    throw Error("这不是有效的弦迹作品文件。");
  if (
    !Number.isFinite(raw.bpm) ||
    raw.bpm < 40 ||
    raw.bpm > 200 ||
    ![2, 4, 8].includes(raw.bars) ||
    ![1, 2, 4].includes(raw.division) ||
    !Object.hasOwn(SCALES, raw.scale) ||
    !Number.isInteger(raw.root) ||
    raw.root < 0 ||
    raw.root > 11
  )
    throw Error("作品的节拍或音阶设置无效。");
  const ids = new Set();
  const tracks = raw.tracks.map((t) => {
    if (
      typeof t.id !== "string" ||
      ids.has(t.id) ||
      !INSTRUMENTS.some((i) => i.id === t.instrument) ||
      !Number.isFinite(t.volume) ||
      t.volume < 0 ||
      t.volume > 1
    )
      throw Error("作品的音轨设置无效。");
    ids.add(t.id);
    return {
      id: t.id,
      instrument: t.instrument,
      volume: t.volume,
      muted: !!t.muted,
      solo: !!t.solo,
    };
  });
  let total = 0;
  const strokes = raw.strokes.map((s) => {
    if (
      !ids.has(s.track) ||
      !/^#[0-9a-f]{6}$/i.test(s.color) ||
      !Number.isFinite(s.width) ||
      s.width < 1 ||
      s.width > 12 ||
      !Array.isArray(s.points) ||
      s.points.length < 1 ||
      (total += s.points.length) > 100000
    )
      throw Error("作品的线条数据无效或过大。");
    return {
      id: uid(),
      track: s.track,
      color: s.color,
      width: s.width,
      points: s.points.map((p) => {
        if (
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          p.x < 0 ||
          p.x > 1 ||
          p.y < 0 ||
          p.y > 1
        )
          throw Error("作品包含无效坐标。");
        return { x: p.x, y: p.y };
      }),
    };
  });
  return {
    ...createDoc(raw.title.trim() || "未命名的旋律"),
    bpm: raw.bpm,
    bars: raw.bars,
    division: raw.division,
    scale: raw.scale,
    root: raw.root,
    tracks,
    strokes,
  };
}
export function exportMidi(doc) {
  const vlq = (n) => {
    let a = [n & 127];
    while ((n >>= 7)) a.unshift((n & 127) | 128);
    return a;
  };
  const events = [];
  const programs = { keys: 4, bell: 10, pluck: 24, pad: 89, bass: 33 };
  doc.tracks.forEach((t, i) =>
    events.push({
      tick: 0,
      bytes: [0xc0 + (i >= 9 ? i + 1 : i), programs[t.instrument]],
    }),
  );
  const tempo = Math.round(60000000 / doc.bpm);
  events.push({
    tick: 0,
    bytes: [255, 81, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255],
  });
  compile(doc).forEach((n) => {
    const track = doc.strokes.find((s) => s.id === n.stroke).track,
      index = doc.tracks.findIndex((t) => t.id === track),
      ch = index >= 9 ? index + 1 : index,
      m = n.midi - (n.instrument === "bass" ? 12 : 0),
      tick = Math.round(((n.time * doc.bpm) / 60) * 480);
    events.push(
      { tick, bytes: [144 + ch, m, Math.max(1, Math.round(n.volume * 90))] },
      {
        tick: tick + Math.round(((n.length * doc.bpm) / 60) * 480),
        bytes: [128 + ch, m, 0],
      },
    );
  });
  events.sort((a, b) => a.tick - b.tick);
  let last = 0;
  const data = events.flatMap((e) => {
    const d = [...vlq(e.tick - last), ...e.bytes];
    last = e.tick;
    return d;
  });
  data.push(...vlq(Math.max(0, doc.bars * 4 * 480 - last)), 255, 47, 0);
  const len = data.length;
  return new Uint8Array([
    77,
    84,
    104,
    100,
    0,
    0,
    0,
    6,
    0,
    0,
    0,
    1,
    1,
    224,
    77,
    84,
    114,
    107,
    (len >>> 24) & 255,
    (len >>> 16) & 255,
    (len >>> 8) & 255,
    len & 255,
    ...data,
  ]);
}
