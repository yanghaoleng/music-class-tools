import { notesAt, duration } from "./model.mjs";
import {voice,scheduleStep,MAX_RELEASE} from "./synth.mjs";
export {voice} from "./synth.mjs";
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
// Playback intent and the visual clock start immediately. Browsers may defer the
// audio clock until a trusted pointer/keyboard gesture; activate() joins both clocks.
export class Player {
  constructor() {
    this.ctx = null;
    this.timer = null;
    this.isPlaying = false;
    this.loop = true;
    this.volume = 0.65;
    this.offset = 0;
    this.virtualStart = 0;
    this.out = null;
    this.liveStroke = null;
    this.voices = new Map();
  }
  context() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ctx.addEventListener("statechange", () => {
        if (this.ctx.state === "running" && this.isPlaying) this.connectAudio();
      });
    }
    return this.ctx;
  }
  async unlock() {
    const ctx = this.context();
    if (ctx.state !== "running") await ctx.resume();
  }
  activate() {
    const ctx = this.context();
    // resume() must be called again from the drawing gesture when initial autoplay
    // was blocked. Do not gate it behind the earlier, still-pending promise.
    if (ctx.state === "running") {
      this.connectAudio();
      return Promise.resolve();
    }
    return ctx.resume().then(() => this.connectAudio());
  }
  connectAudio() {
    if (!this.isPlaying || this.out || this.ctx.state !== "running") return;
    const offset = this.position();
    this.out = createOutput(this.ctx, this.volume);
    this.start = this.ctx.currentTime + 0.025 - offset;
    this.step = Math.ceil(((offset * this.doc.bpm) / 60) * this.doc.division);
    this.tick();
  }
  play(doc, loop = true) {
    this.stopTimer();
    this.doc = doc;
    this.loop = loop;
    this.isPlaying = true;
    this.virtualStart = performance.now() / 1000;
    this.timer = setInterval(() => this.tick(), 25);
    return this.activate();
  }
  elapsed() {
    if (!this.isPlaying) return this.offset;
    if (this.out && this.ctx?.state === "running")
      return Math.max(0, this.ctx.currentTime - this.start);
    return (
      this.offset + Math.max(0, performance.now() / 1000 - this.virtualStart)
    );
  }
  tick() {
    if (!this.isPlaying) return;
    const d = this.doc,
      total = d.bars * 4 * d.division,
      interval = 60 / d.bpm / d.division;
    if (!this.loop && this.elapsed() >= duration(d)) {
      this.pause(true);
      this.onEnd?.();
      return;
    }
    if (!this.out || this.ctx.state !== "running") return;
    while (this.start + this.step * interval < this.ctx.currentTime + 0.12) {
      if (!this.loop && this.step >= total) return;
      const time = this.start + this.step * interval;
      const score = this.liveStroke
        ? { ...d, strokes: [...d.strokes, this.liveStroke] }
        : d;
      if(time>=this.ctx.currentTime-.01)scheduleStep(this.ctx,this.out,notesAt(score,this.step%total),Math.max(time,this.ctx.currentTime),interval*.98,this.step,this.voices);
      this.step++;
    }
  }
  position() {
    return this.doc ? this.elapsed() % duration(this.doc) : 0;
  }
  stopTimer() {
    clearInterval(this.timer);
    this.timer = null;
    this.voices.clear();
    if (this.out) {
      this.out.gain.cancelScheduledValues(this.ctx.currentTime);
      this.out.gain.setTargetAtTime(0.0001, this.ctx.currentTime, 0.012);
      const old = this.out;
      setTimeout(() => old.disconnect(), 1500);
      this.out = null;
    }
  }
  pause(reset = false) {
    const offset = this.position();
    this.isPlaying = false;
    this.stopTimer();
    this.offset = reset ? 0 : offset;
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
      Math.ceil((duration(doc) + MAX_RELEASE + .2) * rate),
      rate,
    ),
    out = createOutput(ctx, 0.75);
  const bank=new Map(),interval=60/doc.bpm/doc.division;
  for(let step=0;step<doc.bars*4*doc.division;step++)scheduleStep(ctx,out,notesAt(doc,step),step*interval,interval*.98,step,bank);
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
