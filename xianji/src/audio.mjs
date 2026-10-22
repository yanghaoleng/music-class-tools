import { notesAt, compile, duration } from "./model.mjs";
export function createOutput(ctx, volume = 0.65) {
  const gain = ctx.createGain();
  gain.gain.value = volume;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 6;
  gain.connect(compressor);
  compressor.connect(ctx.destination);
  return gain;
}
export function voice(ctx, out, n, time, len = 0.3) {
  const freq =
    440 * 2 ** ((n.midi - 69 - (n.instrument === "bass" ? 12 : 0)) / 12);
  const profiles = {
    keys: [
      [1, 1, "sine"],
      [2, 0.22, "sine"],
      [3, 0.07, "sine"],
    ],
    bell: [
      [1, 1, "sine"],
      [2.76, 0.22, "sine"],
      [5.4, 0.08, "sine"],
    ],
    pluck: [
      [1, 0.65, "triangle"],
      [2, 0.13, "sine"],
    ],
    pad: [
      [1, 0.5, "sine"],
      [1.004, 0.3, "triangle"],
    ],
    bass: [
      [1, 0.85, "sine"],
      [2, 0.16, "triangle"],
    ],
  };
  const attack = n.instrument === "pad" ? 0.09 : 0.008,
    tail =
      n.instrument === "bell" ? 0.85 : n.instrument === "pad" ? 0.65 : 0.22;
  const g = ctx.createGain();
  g.connect(out);
  const peak = Math.max(0.0001, n.volume * 0.16);
  g.gain.setValueAtTime(0.0001, time);
  g.gain.exponentialRampToValueAtTime(peak, time + attack);
  g.gain.exponentialRampToValueAtTime(
    Math.max(0.0001, peak * 0.45),
    time + Math.max(attack + 0.01, len),
  );
  g.gain.exponentialRampToValueAtTime(0.0001, time + len + tail);
  const oscs = profiles[n.instrument].map(([ratio, vol, type]) => {
    const o = ctx.createOscillator(),
      v = ctx.createGain();
    o.type = type;
    o.frequency.value = freq * ratio;
    v.gain.value = vol;
    o.connect(v);
    v.connect(g);
    o.onended = () => {
      o.disconnect();
      v.disconnect();
    };
    o.start(time);
    o.stop(time + len + tail + 0.02);
    return o;
  });
  oscs.at(-1).addEventListener("ended", () => g.disconnect());
  return g;
}
export class Player {
  constructor() {
    this.ctx = null;
    this.timer = null;
    this.isPlaying = false;
    this.loop = true;
    this.volume = 0.65;
    this.offset = 0;
    this.run = 0;
  }
  async unlock() {
    if (!this.ctx)
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state !== "running") await this.ctx.resume();
  }
  async play(doc, loop = true) {
    const token = ++this.run;
    await this.unlock();
    if (token !== this.run) return;
    this.stopTimer();
    this.doc = doc;
    this.loop = loop;
    this.out = createOutput(this.ctx, this.volume);
    this.isPlaying = true;
    this.start = this.ctx.currentTime + 0.06 - this.offset;
    this.step = Math.floor(((this.offset * doc.bpm) / 60) * doc.division);
    this.tick();
    this.timer = setInterval(() => this.tick(), 25);
  }
  tick() {
    if (!this.isPlaying) return;
    const d = this.doc,
      total = d.bars * 4 * d.division,
      interval = 60 / d.bpm / d.division;
    while (this.start + this.step * interval < this.ctx.currentTime + 0.12) {
      if (!this.loop && this.step >= total) {
        if (this.ctx.currentTime >= this.start + duration(d)) {
          this.pause(true);
          this.onEnd?.();
        }
        return;
      }
      const time = this.start + this.step * interval;
      if (time >= this.ctx.currentTime - 0.01)
        notesAt(d, this.step % total).forEach((n) =>
          voice(
            this.ctx,
            this.out,
            n,
            Math.max(time, this.ctx.currentTime),
            interval * 0.82,
          ),
        );
      this.step++;
    }
  }
  position() {
    if (!this.ctx || !this.isPlaying) return this.offset;
    return Math.max(0, this.ctx.currentTime - this.start) % duration(this.doc);
  }
  stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
    if (this.out) {
      this.out.gain.cancelScheduledValues(this.ctx.currentTime);
      this.out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.012);
      const old = this.out;
      setTimeout(() => old.disconnect(), 1500);
      this.out = null;
    }
  }
  pause(reset = false) {
    this.run++;
    if (this.isPlaying) this.offset = this.position();
    this.isPlaying = false;
    this.stopTimer();
    if (reset) this.offset = 0;
  }
  setVolume(v) {
    this.volume = v;
    if (this.out) this.out.gain.setTargetAtTime(v, this.ctx.currentTime, 0.02);
    if (this.previewOut)
      this.previewOut.gain.setTargetAtTime(
        v * 0.55,
        this.ctx.currentTime,
        0.02,
      );
  }
  async preview(n) {
    await this.unlock();
    if (!this.previewOut)
      this.previewOut = createOutput(this.ctx, this.volume * 0.55);
    voice(this.ctx, this.previewOut, n, this.ctx.currentTime, 0.12);
  }
}
export async function renderWav(doc) {
  const rate = 44100,
    ctx = new OfflineAudioContext(
      2,
      Math.ceil((duration(doc) + 1.5) * rate),
      rate,
    ),
    out = createOutput(ctx, 0.75);
  compile(doc).forEach((n) => voice(ctx, out, n, n.time, n.length));
  const buffer = await ctx.startRendering();
  const bytes = new ArrayBuffer(44 + buffer.length * 4),
    v = new DataView(bytes);
  let o = 0;
  const str = (s) => {
    for (const c of s) v.setUint8(o++, c.charCodeAt(0));
  };
  const u16 = (n) => {
    v.setUint16(o, n, true);
    o += 2;
  };
  const u32 = (n) => {
    v.setUint32(o, n, true);
    o += 4;
  };
  str("RIFF");
  u32(bytes.byteLength - 8);
  str("WAVEfmt ");
  u32(16);
  u16(1);
  u16(2);
  u32(rate);
  u32(rate * 4);
  u16(4);
  u16(16);
  str("data");
  u32(buffer.length * 4);
  const left = buffer.getChannelData(0),
    right = buffer.getChannelData(1);
  for (let i = 0; i < buffer.length; i++) {
    v.setInt16(o, Math.max(-1, Math.min(1, left[i])) * 32767, true);
    o += 2;
    v.setInt16(o, Math.max(-1, Math.min(1, right[i])) * 32767, true);
    o += 2;
  }
  return new Blob([bytes], { type: "audio/wav" });
}
