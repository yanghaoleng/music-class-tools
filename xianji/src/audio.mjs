import { notesAt, duration } from "./model.mjs";
import {getScoreIndex} from "./score-index.mjs";
import {voice,sustainedVoice,SYNTHS,scheduleStep,MAX_RELEASE,prepareVoices} from "./synth.mjs";
import {PlaybackSession} from "./audio-session.mjs";
export {voice} from "./synth.mjs";
export function createOutput(ctx, volume = 0.65) {
  const gain = ctx.createGain();
  gain.gain.value = volume;
  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.ratio.value = 6;
  gain.connect(compressor);
  compressor.connect(ctx.destination);
  gain.dispose = () => {gain.disconnect();compressor.disconnect();};
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
    this.session = new PlaybackSession();
    this.session.onchange = () => {this.connectAudio();this.reportState();};
    this.prepared = false;
    this.hasStartedAudio = false;
    this.lastAudioState = null;
    this.previewRelease = null;
  }
  get audioState() {
    if (!this.prepared || this.session.state === "preparing") return "preparing";
    return this.ctx?.state === "running" && this.session.state === "ready" ? "ready" : "waiting";
  }
  reportState(force=false) {
    const state=this.audioState;
    if (force || state!==this.lastAudioState) {this.lastAudioState=state;this.onAudioStateChange?.(state);}
  }
  context() {
    if (!this.ctx) {
      this.session.prepare();
      this.ctx = new (window.AudioContext || window.webkitAudioContext)({latencyHint: "interactive"});
      this.ctx.addEventListener("statechange", () => {
        if (this.ctx.state === "running" && this.isPlaying) this.connectAudio();
        this.reportState();
      });
      const began=performance.now();
      prepareVoices(this.ctx);this.prepared=true;
      this.preparationMs=performance.now()-began;
      this.reportState();
    }
    return this.ctx;
  }
  unlock() {return this.activate();}
  activate() {
    const ctx = this.context();
    // Both calls must remain inside the trusted event, without awaiting a stale
    // autoplay resume promise from page load. Safari may accept touchend/click
    // even when pointerdown was rejected.
    const media = this.session.activate();
    const resume = ctx.state === "running" ? Promise.resolve() : ctx.resume();
    this.reportState();
    return Promise.all([media,resume]).then(() => {this.connectAudio();this.reportState();});
  }
  connectAudio() {
    if (!this.isPlaying || !this.doc || this.out || this.ctx?.state !== "running" || this.session.state !== "ready") return;
    const interval=60/this.doc.bpm/this.doc.division;
    let offset = this.position(), step=Math.ceil(offset/interval-1e-8);
    if (!this.hasStartedAudio) {
      const first=getScoreIndex(this.doc).steps.findIndex(notes=>notes.length);
      if (first>=0) {step=first;offset=first*interval;}
    }
    this.hasStartedAudio=true;this.offset=offset;
    this.out = createOutput(this.ctx, this.volume);
    this.start = this.ctx.currentTime + 0.025 - offset;
    this.step = step;
    this.tick();
  }
  play(doc, loop = true) {
    this.stopTimer();
    clearTimeout(this.previewRelease);
    if (this.doc?.id !== doc.id) {this.offset=0;this.hasStartedAudio=false;}
    this.doc = doc;
    getScoreIndex(doc);
    this.context();
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
    // Skip missed slots after a stalled frame instead of replaying a backlog.
    this.step = Math.max(this.step, Math.ceil((this.ctx.currentTime - .01 - this.start) / interval));
    const index = getScoreIndex(d);
    while (this.start + this.step * interval < this.ctx.currentTime + 0.18) {
      if (!this.loop && this.step >= total) return;
      const time = this.start + this.step * interval;
      const slot = this.step % total;
      let notes = index.steps[slot];
      if (this.liveStroke) notes = [...notes, ...notesAt({...d, strokes: [this.liveStroke]}, slot)].slice(0, 32);
      if (time >= this.ctx.currentTime - .01)
        scheduleStep(this.ctx, this.out, notes, Math.max(time, this.ctx.currentTime), interval * .98, this.step, this.voices);
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
      setTimeout(() => old.dispose(), 1500);
      this.out = null;
    }
  }
  pause(reset = false) {
    const offset = this.position();
    this.isPlaying = false;
    this.stopTimer();
    this.session.pause();
    this.offset = reset ? 0 : offset;
    this.reportState();
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
  cancelPreview() {
    if (this.previewOut) {
      const old = this.previewOut;
      old.gain.setTargetAtTime(.0001, this.ctx.currentTime, .012);
      setTimeout(() => old.dispose(), 1500);
    }
    this.previewOut = null;this.previewVoice = null;
  }
  async preview(n) {
    await this.unlock();
    if (!this.previewOut)
      this.previewOut = createOutput(this.ctx, this.volume * 0.55);
    const time = this.ctx.currentTime;
    if (SYNTHS[n.instrument]?.continuous) {
      const previous = this.previewVoice;
      if (previous?.instrument === n.instrument && previous.until > time)
        previous.handle.extend(n, time, .16);
      else this.previewVoice = {instrument: n.instrument, handle: sustainedVoice(this.ctx, this.previewOut, n, time, .16)};
      this.previewVoice.until = time + Math.max(.16, SYNTHS[n.instrument].attack + .012) + SYNTHS[n.instrument].release;
    } else voice(this.ctx, this.previewOut, n, time, .12);
    clearTimeout(this.previewRelease);
    this.previewRelease=setTimeout(()=>{if(!this.isPlaying)this.session.pause();},(MAX_RELEASE+.4)*1000);
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
  for(let step=0;step<doc.bars*4*doc.division;step++)scheduleStep(ctx,out,getScoreIndex(doc).steps[step],step*interval,interval*.98,step,bank);
  const buffer = await ctx.startRendering();
  out.dispose();
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
  // Yield while packing long exports so UI/audio scheduling keep their turns.
  for (let start = 0; start < buffer.length; start += 32768) {
    const end = Math.min(buffer.length, start + 32768);
    for (let i = start; i < end; i++) {
      v.setInt16(o, Math.max(-1, Math.min(1, left[i])) * 32767, true);o += 2;
      v.setInt16(o, Math.max(-1, Math.min(1, right[i])) * 32767, true);o += 2;
    }
    if (end < buffer.length) await new Promise(resolve => setTimeout(resolve, 0));
  }

  return new Blob([bytes], { type: "audio/wav" });
}
