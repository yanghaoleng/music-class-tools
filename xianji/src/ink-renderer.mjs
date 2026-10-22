// Static ink is painted only after an edit/resize. Playback copies a 16 CSS-pixel
// strip from cached audible ink. No full-screen filters or per-frame path parsing.
export const PLAYBACK_BAND_WIDTH = 16;
const MAX_PIXELS = 2_500_000;
export class InkRenderer {
  constructor(base, live, highlight) {
    this.base = base; this.live = live; this.highlight = highlight;
    this.audible = document.createElement('canvas');
    this.patterns = new Map(); this.paths = new WeakMap();
    this.doc = null; this.width = 0; this.height = 0; this.lastBand = null;
  }
  resize(width, height, dpr = 1) {
    if (!width || !height) return;
    const scale = Math.min(dpr, 2, Math.sqrt(MAX_PIXELS / (width * height)));
    if (this.width === width && this.height === height && this.scale === scale) return;
    this.width = width; this.height = height; this.scale = scale;
    for (const canvas of [this.base, this.live, this.highlight, this.audible]) {
      canvas.width = Math.ceil(width * scale); canvas.height = Math.ceil(height * scale);
    }
    this.paths = new WeakMap(); this.patterns.clear(); this.lastBand = null;this.liveId = null;this.liveCount = 0;
    this.redraw();
  }
  pattern(color, ctx) {
    if (this.patterns.has(color)) return this.patterns.get(color);
    const tile = document.createElement('canvas'); tile.width = tile.height = 64;
    const tc = tile.getContext('2d'), data = tc.createImageData(64, 64);
    const rgb = color.slice(1).match(/../g).map(x => parseInt(x, 16));
    let seed = 8741;
    for (let i = 0; i < data.data.length; i += 4) {
      seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
      const r = (seed >>> 0) / 4294967296;
      data.data[i] = rgb[0];data.data[i + 1] = rgb[1];data.data[i + 2] = rgb[2];
      data.data[i + 3] = r < .15 ? 0 : r < .3 ? 105 : 240;
    }
    tc.putImageData(data, 0, 0);
    const pattern = ctx.createPattern(tile, 'repeat');
    this.patterns.set(color, pattern); return pattern;
  }
  context(canvas) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    return ctx;
  }
  path(stroke) {
    let path = this.paths.get(stroke);
    if (path) return path;
    path = new Path2D();
    if (stroke.points.length === 1) {
      const p = stroke.points[0];path.arc(p.x * this.width, p.y * this.height, stroke.width / 2, 0, Math.PI * 2);
    } else stroke.points.forEach((p, i) => i ? path.lineTo(p.x * this.width, p.y * this.height) : path.moveTo(p.x * this.width, p.y * this.height));
    this.paths.set(stroke, path); return path;
  }
  paint(ctx, stroke, opacity = 1, path = this.path(stroke)) {
    ctx.globalAlpha = opacity; ctx.strokeStyle = this.pattern(stroke.color, ctx);
    ctx.lineWidth = stroke.width; ctx.lineCap = ctx.lineJoin = 'round';
    if (stroke.points.length === 1) {ctx.fillStyle = ctx.strokeStyle;ctx.fill(path);}
    else ctx.stroke(path);
    ctx.globalAlpha = 1;
  }
  setDoc(doc) {
    const previous = this.doc;
    const append = previous && previous.tracks === doc.tracks &&
      previous.strokes.length <= doc.strokes.length &&
      previous.strokes.every((s, i) => s === doc.strokes[i]);
    this.doc = doc;
    if (!this.width) return;
    if (append) this.paintStrokes(doc.strokes.slice(previous.strokes.length));
    else this.redraw();
  }
  paintStrokes(strokes) {
    if (!this.doc) return;
    const tracks = new Map(this.doc.tracks.map(t => [t.id, t])), solo = this.doc.tracks.some(t => t.solo);
    const base = this.context(this.base), audible = this.context(this.audible);
    for (const stroke of strokes) {
      const track = tracks.get(stroke.track), heard = track && !track.muted && (!solo || track.solo);
      this.paint(base, stroke, heard ? 1 : .18);
      if (heard) this.paint(audible, stroke);
    }
  }
  redraw() {
    if (!this.width) return;
    // clearRect uses backing-store coordinates, independent of previous drawing.
    for (const canvas of [this.base, this.audible, this.highlight]) {
      const ctx = canvas.getContext('2d'); ctx.resetTransform(); ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    this.lastBand = null; this.paintStrokes(this.doc?.strokes || []);
  }
  drawLive(stroke) {
    const ctx = this.context(this.live);
    // Paint only new segments, once per animation frame.
    if (this.liveId !== stroke?.id) {
      ctx.clearRect(0, 0, this.width, this.height); this.liveId = stroke?.id; this.liveCount = 0;
    }
    if (!stroke?.points.length) return;
    if (stroke.points.length === 1 && this.liveCount === 1) return;
    const path = new Path2D();
    if (stroke.points.length === 1) {
      const p = stroke.points[0];path.arc(p.x * this.width, p.y * this.height, stroke.width / 2, 0, Math.PI * 2);
    } else stroke.points.slice(Math.max(0, this.liveCount - 1)).forEach((p, i) => i ? path.lineTo(p.x * this.width, p.y * this.height) : path.moveTo(p.x * this.width, p.y * this.height));
    this.liveCount = stroke.points.length;
    this.paint(ctx, stroke, 1, path);
  }
  clearLive() { this.liveId = null; this.liveCount = 0; const ctx = this.context(this.live); ctx.clearRect(0, 0, this.width, this.height); }
  scan(phase, enabled) {
    const ctx = this.highlight.getContext('2d');
    ctx.resetTransform();
    if (this.lastBand) ctx.clearRect(this.lastBand.x, 0, this.lastBand.width, this.highlight.height);
    this.lastBand = null;
    if (!enabled || !this.doc?.strokes.length) return;
    const x = Math.max(0, Math.floor((phase * this.width - PLAYBACK_BAND_WIDTH / 2) * this.scale));
    const width = Math.min(Math.ceil(PLAYBACK_BAND_WIDTH * this.scale), this.highlight.width - x);
    if (width <= 0) return;
    ctx.drawImage(this.audible, x, 0, width, this.audible.height, x, 0, width, this.highlight.height);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = '#0000005c'; ctx.fillRect(x, 0, width, this.highlight.height);
    ctx.globalCompositeOperation = 'source-over'; this.lastBand = {x, width};
  }
  destroy() {
    for (const c of [this.base, this.live, this.highlight, this.audible]) c.width = c.height = 0;
    this.patterns.clear(); this.paths = new WeakMap(); this.doc = null;
  }
}
