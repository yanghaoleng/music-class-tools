import React, { useState, useRef, useEffect, useMemo, memo } from "react";
import { createRoot } from "react-dom/client";
import {
  Waveform,
  Plus,
  MagnifyingGlass,
  MusicNotes,
  PencilSimple,
  Eraser,
  ArrowCounterClockwise,
  ArrowClockwise,
  Play,
  Pause,
  Stop,
  Repeat,
  SpeakerHigh,
  SpeakerSlash,
  FloppyDisk,
  DownloadSimple,
  UploadSimple,
  X,
  Check,
  Trash,
  Copy,
  Question,
  ArrowRight,
  FolderOpen,
  SlidersHorizontal,
  Keyboard,
  Metronome,
  CaretDown,
  NotePencil,
  Headphones,
  ArrowsOut,
  Star,
  House,
} from "@phosphor-icons/react";
import {
  COLORS,
  INSTRUMENTS,
  SCALES,
  ROOTS,
  uid,
  createDoc,
  makeDemo,
  validateDoc,
  pitches,
  noteName,
  pitchAt,
  notesAt,
  compile,
  categories,
  duration,
  exportMidi,
} from "./model.mjs";
import { Player, renderWav } from "./audio.mjs";
import "./style.css";

const STORAGE = "xianji.workspace.v1";
function readWorkspace() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE) || "null");
    if (!s) return {};
    const clean = (d) => ({
      ...validateDoc(d),
      id: typeof d.id === "string" ? d.id : uid(),
      createdAt: d.createdAt || Date.now(),
      updatedAt: d.updatedAt || Date.now(),
    });
    return {
      draft: s.draft ? clean(s.draft) : null,
      library: Array.isArray(s.library)
        ? s.library.slice(0, 100).map(clean)
        : [],
    };
  } catch {
    return {
      error:
        "浏览器中的作品未能读取。你仍可创作，也可以导入之前导出的作品文件。",
    };
  }
}
const initial = readWorkspace();
const player = new Player();
const demos = [0, 1, 2].map(makeDemo);
const pathData = (points) =>
  points.length === 1
    ? `M${points[0].x * 1000},${points[0].y * 560}l.1,.1`
    : points
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${(p.x * 1000).toFixed(2)},${(p.y * 560).toFixed(2)}`,
        )
        .join(" ");
const Marks = memo(function Marks({ doc, draft = null }) {
  const solo = doc.tracks.some((t) => t.solo);
  return (
    <>
      {[...doc.strokes, ...(draft ? [draft] : [])].map((s) => {
        const t = doc.tracks.find((t) => t.id === s.track),
          muted = t?.muted || (solo && !t?.solo);
        return (
          <g key={s.id} opacity={muted ? 0.15 : 1}>
            <path
              d={pathData(s.points)}
              stroke={s.color}
              strokeWidth={s.width}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
            <circle
              cx={s.points[0].x * 1000}
              cy={s.points[0].y * 560}
              r="4"
              fill={s.color}
            />
          </g>
        );
      })}
    </>
  );
});
function Thumbnail({ doc }) {
  return (
    <svg viewBox="0 0 1000 560" aria-hidden="true">
      <Marks doc={doc} />
    </svg>
  );
}
function IconButton({ label, children, ...props }) {
  return (
    <button
      type="button"
      className="icon-button"
      title={label}
      aria-label={label}
      {...props}
    >
      {children}
    </button>
  );
}
function TempoInput({ value, onChange }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <input
      type="number"
      aria-label="速度 BPM"
      min="40"
      max="200"
      value={text}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (n >= 40 && n <= 200) onChange(n);
      }}
      onBlur={() => {
        const n = Math.round(
          Math.max(40, Math.min(200, Number(text) || value)),
        );
        setText(String(n));
        if (n !== value) onChange(n);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
      }}
    />
  );
}
function Modal({ title, close, children, wide = false }) {
  const ref = useRef();
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    const prev = document.activeElement;
    ref.current.focus();
    const key = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
      }
      if (e.key === "Tab") {
        const items = [
          ...ref.current.querySelectorAll("button,input,select,a[href]"),
        ].filter((el) => !el.disabled && el.getClientRects().length);
        if (!items.length) return;
        if (
          e.shiftKey &&
          (document.activeElement === items[0] ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          items.at(-1).focus();
        } else if (!e.shiftKey && document.activeElement === items.at(-1)) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (prev?.isConnected) prev.focus();
    };
  }, []);
  return (
    <div
      className="overlay"
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <section
        className={"modal " + (wide ? "wide" : "")}
        tabIndex="-1"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        ref={ref}
      >
        <header>
          <h2>{title}</h2>
          <IconButton label="关闭" onClick={close}>
            <X />
          </IconButton>
        </header>
        {children}
      </section>
    </div>
  );
}
function ScoreCanvas({
  doc,
  track,
  color,
  width,
  tool,
  onStroke,
  onErase,
  playing,
  showGrid,
  immersive,
  onLimit,
}) {
  const pointCount = useMemo(
    () => doc.strokes.reduce((n, s) => n + s.points.length, 0),
    [doc.strokes],
  );
  const svg = useRef(),
    draftRef = useRef(),
    lastPreview = useRef(0);
  const [draft, setDraft] = useState(null),
    [phase, setPhase] = useState(0);
  useEffect(() => {
    let frame;
    let last = 0;
    function draw(now) {
      if (now - last > 25) {
        setPhase(player.position() / duration(doc));
        last = now;
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [doc.bpm, doc.bars, playing]);
  const point = (e) => {
    const r = svg.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(0.99999, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  function erase(p) {
    onErase(p, svg.current.getBoundingClientRect());
  }
  function preview(p) {
    if (performance.now() - lastPreview.current < 115) return;
    lastPreview.current = performance.now();
    player
      .preview({
        midi: pitchAt(p.y, doc),
        instrument: track.instrument,
        volume: track.volume,
      })
      .catch(() => {});
  }
  function down(e) {
    if (e.button !== 0) return;
    e.preventDefault();
    svg.current.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === "erase") {
      draftRef.current = { erase: true };
      erase(p);
      return;
    }
    if (doc.strokes.length >= 500 || pointCount >= 99999) {
      onLimit();
      return;
    }
    const s = { id: uid(), track: track.id, color, width, points: [p] };
    draftRef.current = s;
    setDraft(s);
    preview(p);
  }
  function move(e) {
    if (!draftRef.current) return;
    const p = point(e);
    if (draftRef.current.erase) {
      erase(p);
      return;
    }
    const d = draftRef.current,
      a = d.points.at(-1);
    if (Math.hypot(p.x - a.x, p.y - a.y) < 0.002) return;
    if (d.points.length >= Math.min(2500, 100000 - pointCount)) return;
    const s = { ...d, points: [...d.points, p] };
    draftRef.current = s;
    setDraft(s);
    preview(p);
  }
  function end(e) {
    if (!draftRef.current) return;
    if (!draftRef.current.erase) {
      let s = draftRef.current;
      if (s.points.length === 1) {
        const p = s.points[0],
          span = 0.6 / (doc.bars * 4 * doc.division);
        s = {
          ...s,
          points: [
            { x: Math.max(0, p.x - span), y: p.y },
            { x: Math.min(0.99999, p.x + span), y: p.y },
          ],
        };
      }
      onStroke(s);
    }
    draftRef.current = null;
    setDraft(null);
    if (svg.current.hasPointerCapture(e.pointerId))
      svg.current.releasePointerCapture(e.pointerId);
  }
  const ns = pitches(doc),
    beatCount = doc.bars * 4;
  const active = playing
    ? notesAt(doc, Math.floor(phase * beatCount * doc.division))
    : [];
  return (
    <div className={"score-shell " + (immersive ? "immersive-score" : "")}>
      <div className="bar-labels">
        {Array.from({ length: doc.bars }, (_, i) => (
          <span key={i}>
            {String(i + 1).padStart(2, "0")}
            <small>小节</small>
          </span>
        ))}
      </div>
      <div className="score-row">
        <div className="pitch-labels">
          {ns.map((n, i) => (
            <span key={n} style={{ top: `${(i / (ns.length - 1)) * 100}%` }}>
              {noteName(n)}
            </span>
          ))}
        </div>
        <div className={"canvas-wrap " + (tool === "erase" ? "erasing" : "")}>
          <svg
            ref={svg}
            className="music-canvas"
            role="application"
            aria-label="音乐画布，用鼠标或手指画线，高处音高低处音低"
            viewBox="0 0 1000 560"
            preserveAspectRatio="none"
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={() => {
              draftRef.current = null;
              setDraft(null);
            }}
          >
            <defs>
              <pattern
                id="dots"
                width="20"
                height="20"
                patternUnits="userSpaceOnUse"
              >
                <circle cx="10" cy="10" r=".8" fill="#d3d8ce" />
              </pattern>
            </defs>
            <rect width="1000" height="560" fill="url(#dots)" />
            {showGrid && (
              <g className="grid-lines">
                {ns.map((n, i) => (
                  <line
                    key={n}
                    x1="0"
                    x2="1000"
                    y1={(i / (ns.length - 1)) * 560}
                    y2={(i / (ns.length - 1)) * 560}
                  />
                ))}
                {Array.from({ length: beatCount + 1 }, (_, i) => (
                  <line
                    className={i % 4 === 0 ? "bar-line" : ""}
                    key={i}
                    x1={(i / beatCount) * 1000}
                    x2={(i / beatCount) * 1000}
                    y1="0"
                    y2="560"
                  />
                ))}
              </g>
            )}
            <Marks doc={doc} draft={draft} />
            {(playing || phase > 0) && (
              <g className="playhead" pointerEvents="none">
                <rect
                  x={phase * 1000 - 15}
                  y="0"
                  width="30"
                  height="560"
                  fill="#326657"
                  opacity=".025"
                />
                <line
                  x1={phase * 1000}
                  x2={phase * 1000}
                  y1="0"
                  y2="560"
                  stroke="#326657"
                  strokeWidth="1"
                  vectorEffect="non-scaling-stroke"
                />
                {active.map((n, i) => (
                  <g key={i}>
                    <circle
                      cx={n.x * 1000}
                      cy={n.y * 560}
                      r="13"
                      fill={n.color}
                      opacity=".14"
                    />
                    <circle
                      cx={n.x * 1000}
                      cy={n.y * 560}
                      r="5"
                      fill={n.color}
                      stroke="#fff"
                      strokeWidth="2"
                    />
                  </g>
                ))}
              </g>
            )}
          </svg>
          {!doc.strokes.length && !draft && (
            <div className="canvas-empty">
              <PencilSimple size={30} weight="light" />
              <h2>第一条线，就是第一段旋律</h2>
              <p>随手画一笔，再按播放听听看</p>
              <span>从左到右是时间 · 从下到上是音高</span>
            </div>
          )}
        </div>
      </div>
      <div className="canvas-bottom">
        <span>
          时间 <span className="axis-line" /> 从左向右流动
        </span>
        <span>
          {doc.strokes.length} 条线 ·{" "}
          {new Set(doc.strokes.map((s) => s.track)).size} 个声部
        </span>
      </div>
    </div>
  );
}
function App() {
  const [doc, setDoc] = useState(initial.draft || makeDemo(0)),
    [library, setLibrary] = useState(initial.library || []),
    [activeTrack, setActiveTrack] = useState(null),
    [color, setColor] = useState(COLORS[0]),
    [width, setWidth] = useState(4),
    [tool, setTool] = useState("draw"),
    [playing, setPlaying] = useState(false),
    [loop, setLoop] = useState(true),
    [volume, setVolume] = useState(0.65),
    [modal, setModal] = useState(null),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("全部作品"),
    [sort, setSort] = useState("recent"),
    [view, setView] = useState("canvas"),
    [grid, setGrid] = useState(true),
    [immersive, setImmersive] = useState(false),
    [history, setHistory] = useState([]),
    [future, setFuture] = useState([]),
    [exporting, setExporting] = useState(false),
    [saveError, setSaveError] = useState(initial.error || ""),
    [savedAt, setSavedAt] = useState(null),
    [progress, setProgress] = useState(0);
  const importRef = useRef(),
    docRef = useRef(doc),
    erasedRef = useRef(false),
    toastTimer = useRef();
  docRef.current = doc;
  const track = doc.tracks.find((t) => t.id === activeTrack) || doc.tracks[0];
  const saved = library.some((d) => d.id === doc.id),
    noteCount = useMemo(() => compile(doc).length, [doc]);
  const notify = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };
  function change(fn, remember = true) {
    setDoc((prev) => {
      if (remember) {
        setHistory((h) => [...h.slice(-39), prev]);
        setFuture([]);
      }
      return {
        ...(typeof fn === "function" ? fn(prev) : fn),
        updatedAt: Date.now(),
      };
    });
  }
  function stop(reset = false) {
    player.pause(reset);
    setPlaying(false);
    if (reset) setProgress(0);
  }
  async function togglePlay() {
    if (playing) {
      stop();
      return;
    }
    if (!noteCount) {
      notify("先在画布上画一条线吧");
      return;
    }
    try {
      await player.play(doc, loop);
      setPlaying(true);
    } catch {
      notify("声音暂时无法启动，请再点一次播放");
    }
  }
  function undo() {
    if (!history.length) return;
    stop();
    const prev = history.at(-1);
    setFuture((f) => [doc, ...f]);
    setHistory(history.slice(0, -1));
    setDoc({ ...prev, updatedAt: Date.now() });
  }
  function redo() {
    if (!future.length) return;
    stop();
    setHistory((h) => [...h, doc]);
    setDoc({ ...future[0], updatedAt: Date.now() });
    setFuture(future.slice(1));
  }
  function load(d) {
    if (doc.strokes.length && !saved)
      setLibrary((l) =>
        [doc, ...l.filter((x) => x.id !== doc.id)].slice(0, 100),
      );
    stop(true);
    setDoc(d);
    setActiveTrack(d.tracks[0].id);
    setHistory([]);
    setFuture([]);
    setView("canvas");
    setModal(null);
    setColor(COLORS[0]);
  }
  function newDoc() {
    load(createDoc());
    notify("新画布已准备好");
  }
  function save() {
    const d = {
      ...doc,
      title: doc.title.trim() || "未命名的旋律",
      updatedAt: Date.now(),
    };
    setDoc(d);
    setLibrary((l) => [d, ...l.filter((x) => x.id !== d.id)].slice(0, 100));
    notify("作品已保存到本机作品集");
  }
  function duplicate(d) {
    load({
      ...structuredClone(d),
      id: uid(),
      title: d.title + " · 副本",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    notify("已创建副本，原作品保留在作品集");
  }
  function updateTrack(id, patch) {
    change((d) => ({
      ...d,
      tracks: d.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    }));
  }
  function erase(p, rect) {
    const current = docRef.current;
    const near = (points) =>
      points.some((b, i) => {
        const a = points[Math.max(0, i - 1)],
          dx = (b.x - a.x) * rect.width,
          dy = (b.y - a.y) * rect.height,
          px = (p.x - a.x) * rect.width,
          py = (p.y - a.y) * rect.height,
          t = Math.max(
            0,
            Math.min(1, (px * dx + py * dy) / (dx * dx + dy * dy || 1)),
          );
        return Math.hypot(px - t * dx, py - t * dy) < 18;
      });
    const ids = current.strokes.filter((s) => near(s.points)).map((s) => s.id);
    if (!ids.length) return;
    change(
      (d) => ({ ...d, strokes: d.strokes.filter((s) => !ids.includes(s.id)) }),
      !erasedRef.current,
    );
    erasedRef.current = true;
  }
  useEffect(() => {
    const end = () => {
      erasedRef.current = false;
    };
    window.addEventListener("pointerup", end);
    return () => window.removeEventListener("pointerup", end);
  }, []);
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const next = library.map((d) => (d.id === doc.id ? doc : d));
        localStorage.setItem(
          STORAGE,
          JSON.stringify({ draft: doc, library: next }),
        );
        setSavedAt(Date.now());
        setSaveError("");
      } catch {
        setSaveError("浏览器存储空间不足或不可用，请导出作品文件备份。");
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [doc, library]);
  useEffect(() => {
    if (!saved) return;
    setLibrary((l) => l.map((d) => (d.id === doc.id ? doc : d)));
  }, [doc]);
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(
          STORAGE,
          JSON.stringify({
            draft: docRef.current,
            library: library.map((d) =>
              d.id === docRef.current.id ? docRef.current : d,
            ),
          }),
        );
      } catch {}
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, [library]);
  useEffect(() => {
    player.doc = doc;
  }, [doc]);
  useEffect(() => {
    if (player.isPlaying) {
      player.pause(true);
      player.play(doc, loop).catch(() => setPlaying(false));
    } else {
      player.pause(true);
      setProgress(0);
    }
  }, [doc.bpm, doc.bars, doc.division, doc.scale, doc.root]);
  useEffect(() => {
    player.loop = loop;
  }, [loop]);
  useEffect(() => {
    player.onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const timer = setInterval(() => {
      if (player.isPlaying) setProgress(player.position());
    }, 100);
    return () => {
      clearInterval(timer);
      player.onEnd = null;
    };
  }, []);
  useEffect(() => {
    const hide = () => {
      if (document.hidden) stop();
    };
    document.addEventListener("visibilitychange", hide);
    return () => document.removeEventListener("visibilitychange", hide);
  }, []);
  useEffect(() => {
    const key = (e) => {
      if (modal || e.target.closest("input,select,textarea,[contenteditable]"))
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        save();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (e.code === "Space") {
        e.preventDefault();
        void togglePlay();
      } else if (e.key === "b" || e.key === "B") setTool("draw");
      else if (e.key === "e" || e.key === "E") setTool("erase");
      else if (e.key === "Escape") setImmersive(false);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  });
  function download(blob, filename) {
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  const filename = doc.title.replace(/[/\\?%*:|"<>]/g, "_") || "弦迹作品";
  async function exportFile(kind) {
    try {
      setExporting(true);
      stop();
      if (kind === "project")
        download(
          new Blob([JSON.stringify(doc, null, 2)], {
            type: "application/json",
          }),
          filename + ".xianji.json",
        );
      if (kind === "wav") {
        const blob = await renderWav(doc);
        download(blob, filename + ".wav");
      }
      if (kind === "midi")
        download(
          new Blob([exportMidi(doc)], { type: "audio/midi" }),
          filename + ".mid",
        );
      if (kind === "svg") {
        const lines = doc.strokes
          .map(
            (s) =>
              `<path d="${pathData(s.points)}" fill="none" stroke="${s.color}" stroke-width="${s.width}" stroke-linecap="round" stroke-linejoin="round"/>`,
          )
          .join("");
        download(
          new Blob(
            [
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 560"><rect width="1000" height="560" fill="#fbfcf7"/>${lines}</svg>`,
            ],
            { type: "image/svg+xml" },
          ),
          filename + ".svg",
        );
      }
      setModal(null);
      notify(
        "已导出" +
          { project: "作品文件", wav: "音频", midi: "MIDI", svg: "画布图片" }[
            kind
          ],
      );
    } catch {
      notify("导出没有完成，请再试一次");
    } finally {
      setExporting(false);
    }
  }
  async function importFile(e) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    try {
      if (f.size > 8 * 1024 * 1024) throw Error("作品文件请控制在 8 MB 以内。");
      const d = validateDoc(JSON.parse(await f.text()));
      load(d);
      notify("作品已导入，可以继续编辑");
    } catch (err) {
      notify(
        err instanceof SyntaxError
          ? "文件内容无法读取，请选择弦迹 JSON 作品文件。"
          : err.message,
      );
    }
  }
  const list = useMemo(
    () =>
      library
        .filter(
          (d) =>
            (!query ||
              (
                d.title +
                " " +
                categories(d).join(" ") +
                " " +
                d.tracks
                  .map(
                    (t) => INSTRUMENTS.find((i) => i.id === t.instrument)?.name,
                  )
                  .join(" ")
              )
                .toLowerCase()
                .includes(query.toLowerCase())) &&
            (filter === "全部作品" || categories(d).includes(filter)),
        )
        .sort((a, b) =>
          sort === "title"
            ? a.title.localeCompare(b.title, "zh")
            : sort === "tempo"
              ? a.bpm - b.bpm
              : b.updatedAt - a.updatedAt,
        ),
    [library, query, filter, sort],
  );
  function libraryView() {
    setView("library");
    setImmersive(false);
  }
  return (
    <div className={"app " + (immersive ? "immersive" : "")}>
      <header className="topbar">
        <a
          className="brand"
          href="/xianji/"
          onClick={(e) => {
            e.preventDefault();
            setView("canvas");
          }}
        >
          <span className="brand-symbol">
            <Waveform size={24} weight="bold" />
          </span>
          <strong>弦迹</strong>
          <span className="brand-caption">把旋律画出来</span>
        </a>
        <nav aria-label="主导航">
          <button
            className={view === "canvas" ? "active" : ""}
            onClick={() => setView("canvas")}
          >
            音乐画布
          </button>
          <button
            className={view === "library" ? "active" : ""}
            onClick={libraryView}
          >
            我的作品<span>{library.length}</span>
          </button>
        </nav>
        <div className="top-actions">
          <IconButton label="使用指南" onClick={() => setModal("help")}>
            <Question size={21} />
          </IconButton>
          <button className="new-button" onClick={newDoc}>
            <Plus weight="bold" />
            新建画布
          </button>
        </div>
      </header>
      <aside className="sidebar">
        <div className="sidebar-heading">
          <span>工作空间</span>
          <span className="tiny-dot" /> <small>本机</small>
        </div>
        <button
          className={"side-nav " + (view === "canvas" ? "selected" : "")}
          onClick={() => setView("canvas")}
        >
          <NotePencil />
          创作画布
          <ArrowRight size={15} />
        </button>
        <button
          className={"side-nav " + (view === "library" ? "selected" : "")}
          onClick={libraryView}
        >
          <FolderOpen />
          我的作品<span>{library.length}</span>
        </button>
        <div className="side-section-heading">
          <span>灵感起点</span>
          <MusicNotes size={15} />
        </div>
        <div className="demo-list">
          {demos.map((d, i) => (
            <button
              key={i}
              onClick={() =>
                load({
                  ...structuredClone(d),
                  id: uid(),
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                })
              }
            >
              <div className="demo-art">
                <Thumbnail doc={d} />
              </div>
              <span>
                {d.title}
                <small>
                  {
                    [
                      "舒展的线条，松弛的旋律",
                      "两种音色，一点雨意",
                      "让节拍带着线条走",
                    ][i]
                  }
                </small>
              </span>
              <ArrowRight size={14} />
            </button>
          ))}
        </div>
        <div className="side-section-heading">
          <span>最近保存</span>
          <button
            title="查看全部作品"
            aria-label="查看全部作品"
            onClick={libraryView}
          >
            <ArrowRight size={15} />
          </button>
        </div>
        <div className="recent-list">
          {library.length ? (
            library
              .slice()
              .sort((a, b) => b.updatedAt - a.updatedAt)
              .slice(0, 4)
              .map((d) => (
                <button key={d.id} onClick={() => load(d)}>
                  <span
                    className="recent-color"
                    style={{ background: d.strokes[0]?.color || COLORS[0] }}
                  />
                  <span>{d.title}</span>
                </button>
              ))
          ) : (
            <p>
              把喜欢的旋律保存下来，
              <br />
              下次从这里继续。
            </p>
          )}
        </div>
        <div className="sidebar-bottom">
          <span className="little-wave">
            <Waveform size={25} weight="light" />
          </span>
          <p>
            没有乐理门槛。
            <br />
            让手比脑袋先走一步。
          </p>
          <button onClick={() => setModal("about")}>
            关于弦迹 <ArrowRight size={13} />
          </button>
        </div>
      </aside>
      <main className={view === "library" ? "library-main" : "studio"}>
        {view === "canvas" ? (
          <>
            <section className="document-header">
              <div>
                <div className="eyebrow">一张画布，无数种旋律</div>
                <div className="title-row">
                  <input
                    className="document-title"
                    aria-label="作品名称"
                    maxLength="80"
                    value={doc.title}
                    onChange={(e) =>
                      change((d) => ({ ...d, title: e.target.value }), false)
                    }
                  />
                  <PencilSimple size={17} />
                </div>
                <div className={"save-state " + (saveError ? "has-error" : "")}>
                  <span className="status-dot" />
                  {saveError
                    ? "本机保存暂不可用"
                    : savedAt
                      ? saved
                        ? "更改已自动保存"
                        : "草稿已自动保存"
                      : "正在保存草稿"}
                  <span className="separator">/</span>
                  {SCALES[doc.scale].name} · {doc.bars} 小节
                </div>
              </div>
              <div className="document-actions">
                <button onClick={save}>
                  <FloppyDisk />
                  保存作品
                </button>
                <button onClick={() => setModal("export")}>
                  <DownloadSimple />
                  导出
                  <CaretDown size={12} />
                </button>
              </div>
            </section>
            <div className="studio-body">
              <section className="canvas-panel">
                <div className="canvas-toolbar">
                  <div className="tool-group">
                    <IconButton
                      label="画笔 (B)"
                      aria-pressed={tool === "draw"}
                      onClick={() => setTool("draw")}
                    >
                      <PencilSimple
                        weight={tool === "draw" ? "fill" : "regular"}
                      />
                    </IconButton>
                    <IconButton
                      label="橡皮擦 (E)"
                      aria-pressed={tool === "erase"}
                      onClick={() => setTool("erase")}
                    >
                      <Eraser />
                    </IconButton>
                  </div>
                  <span className="toolbar-divider" />
                  <div className="color-tools">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        className="color-swatch"
                        style={{ "--swatch": c }}
                        aria-label={"画笔颜色 " + c}
                        aria-pressed={color === c}
                        onClick={() => {
                          setColor(c);
                          setTool("draw");
                        }}
                      >
                        {color === c && <Check size={12} weight="bold" />}
                      </button>
                    ))}
                  </div>
                  <span className="toolbar-divider optional" />
                  <div className="tool-group history-tools">
                    <IconButton
                      label="撤销"
                      disabled={!history.length}
                      onClick={undo}
                    >
                      <ArrowCounterClockwise />
                    </IconButton>
                    <IconButton
                      label="重做"
                      disabled={!future.length}
                      onClick={redo}
                    >
                      <ArrowClockwise />
                    </IconButton>
                  </div>
                  <div className="toolbar-end">
                    <button
                      className="grid-toggle"
                      aria-pressed={grid}
                      onClick={() => setGrid(!grid)}
                    >
                      网格
                    </button>
                    <IconButton
                      label={immersive ? "退出专注模式" : "专注模式"}
                      onClick={() => setImmersive(!immersive)}
                    >
                      <ArrowsOut size={18} />
                    </IconButton>
                  </div>
                </div>
                <ScoreCanvas
                  doc={doc}
                  track={track}
                  color={color}
                  width={width}
                  tool={tool}
                  onStroke={(s) =>
                    change((d) => ({ ...d, strokes: [...d.strokes, s] }))
                  }
                  onErase={erase}
                  playing={playing}
                  showGrid={grid}
                  immersive={immersive}
                  onLimit={() => notify("这张画布已经画满了，请保存后新建一张")}
                />
                <div className="transport">
                  <div className="transport-play">
                    <IconButton
                      label="从头开始"
                      onClick={() => {
                        stop(true);
                      }}
                    >
                      <Stop size={17} weight="fill" />
                    </IconButton>
                    <button
                      className={"play-button " + (playing ? "is-playing" : "")}
                      aria-label={playing ? "暂停" : "播放"}
                      onClick={togglePlay}
                    >
                      {playing ? (
                        <Pause weight="fill" size={21} />
                      ) : (
                        <Play weight="fill" size={21} />
                      )}
                    </button>
                    <IconButton
                      label="循环播放"
                      aria-pressed={loop}
                      onClick={() => setLoop(!loop)}
                    >
                      <Repeat size={21} />
                    </IconButton>
                  </div>
                  <div className="time-display">
                    <strong>
                      {String(Math.floor(progress / 60)).padStart(2, "0")}:
                      {String(Math.floor(progress % 60)).padStart(2, "0")}
                    </strong>
                    <span>
                      /{" "}
                      {String(Math.floor(duration(doc) / 60)).padStart(2, "0")}:
                      {String(Math.floor(duration(doc) % 60)).padStart(2, "0")}
                    </span>
                  </div>
                  <div className="tempo-control">
                    <Metronome size={19} />
                    <label>
                      <TempoInput
                        value={doc.bpm}
                        onChange={(n) => change((d) => ({ ...d, bpm: n }))}
                      />
                      <span>BPM</span>
                    </label>
                    <div className="tempo-step">
                      <button
                        aria-label="加快速度"
                        disabled={doc.bpm >= 200}
                        onClick={() =>
                          change((d) => ({ ...d, bpm: d.bpm + 1 }))
                        }
                      >
                        +
                      </button>
                      <button
                        aria-label="减慢速度"
                        disabled={doc.bpm <= 40}
                        onClick={() =>
                          change((d) => ({ ...d, bpm: d.bpm - 1 }))
                        }
                      >
                        −
                      </button>
                    </div>
                  </div>
                  <div className="volume-control">
                    <SpeakerHigh size={19} />
                    <input
                      aria-label="总音量"
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={volume}
                      onChange={(e) => {
                        const v = +e.target.value;
                        setVolume(v);
                        player.setVolume(v);
                      }}
                    />
                  </div>
                </div>
                <div className="canvas-hint">
                  <button
                    className="mobile-inspiration"
                    onClick={() => setModal("demos")}
                  >
                    <MusicNotes size={14} />
                    灵感示例
                  </button>
                  <span>
                    <Keyboard size={16} />
                    <kbd>空格</kbd>播放 / 暂停
                    <span className="hint-divider" />
                    <kbd>B</kbd>画笔<kbd>E</kbd>橡皮
                  </span>
                  <span>
                    戴上耳机，听见更多细节 <Headphones size={15} />
                  </span>
                </div>
              </section>
              <aside className="inspector">
                <div className="inspector-title">
                  <span>声音与画笔</span>
                  <SlidersHorizontal size={18} />
                </div>
                <section>
                  <div className="inspector-label">
                    当前音色<span>合成音色</span>
                  </div>
                  <div className="instrument-choices">
                    {INSTRUMENTS.map((i, index) => (
                      <button
                        className={track.instrument === i.id ? "chosen" : ""}
                        key={i.id}
                        onClick={() => {
                          updateTrack(track.id, { instrument: i.id });
                          player
                            .preview({
                              midi: 60,
                              instrument: i.id,
                              volume: track.volume,
                            })
                            .catch(() => {});
                        }}
                      >
                        <span
                          className="instrument-icon"
                          style={{ color: i.color }}
                        >
                          {index === 0 ? (
                            <Keyboard />
                          ) : index === 1 ? (
                            <Star />
                          ) : index === 2 ? (
                            <MusicNotes />
                          ) : index === 3 ? (
                            <Waveform />
                          ) : (
                            <SpeakerHigh />
                          )}
                        </span>
                        <span>
                          {i.name}
                          <small>{i.description}</small>
                        </span>
                        {track.instrument === i.id && <Check size={15} />}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="brush-settings">
                  <div className="inspector-label">
                    线条粗细<span>{width} px</span>
                  </div>
                  <div className="width-options">
                    {[2, 4, 7].map((w) => (
                      <button
                        key={w}
                        aria-label={w + " px 画笔"}
                        aria-pressed={width === w}
                        onClick={() => setWidth(w)}
                      >
                        <span style={{ height: w }} />
                      </button>
                    ))}
                  </div>
                </section>
                <section>
                  <div className="inspector-label">旋律规则</div>
                  <label className="setting-row">
                    音阶
                    <select
                      aria-label="音阶"
                      value={doc.scale}
                      onChange={(e) =>
                        change((d) => ({ ...d, scale: e.target.value }))
                      }
                    >
                      {Object.entries(SCALES).map(([id, s]) => (
                        <option key={id} value={id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="setting-row">
                    调性
                    <select
                      aria-label="调性"
                      value={doc.root}
                      onChange={(e) =>
                        change((d) => ({ ...d, root: +e.target.value }))
                      }
                    >
                      {ROOTS.map((r, i) => (
                        <option key={r} value={i}>
                          {r} 调
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="setting-row">
                    画布长度
                    <select
                      aria-label="画布长度"
                      value={doc.bars}
                      onChange={(e) => {
                        stop(true);
                        change((d) => ({ ...d, bars: +e.target.value }));
                      }}
                    >
                      {[2, 4, 8].map((n) => (
                        <option key={n} value={n}>
                          {n} 小节
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="setting-row">
                    发声节奏
                    <select
                      aria-label="发声节奏"
                      value={doc.division}
                      onChange={(e) =>
                        change((d) => ({ ...d, division: +e.target.value }))
                      }
                    >
                      <option value="1">每拍一次</option>
                      <option value="2">每半拍一次</option>
                      <option value="4">每四分之一拍</option>
                    </select>
                  </label>
                </section>
                <section className="tracks-section">
                  <div className="inspector-label">
                    声部
                    <span>
                      {doc.tracks.length} / 12{" "}
                      <button
                        aria-label="添加声部"
                        disabled={doc.tracks.length >= 12}
                        onClick={() => {
                          const t = {
                            id: uid(),
                            instrument: INSTRUMENTS[doc.tracks.length % 5].id,
                            volume: 0.65,
                            muted: false,
                            solo: false,
                          };
                          change((d) => ({ ...d, tracks: [...d.tracks, t] }));
                          setActiveTrack(t.id);
                          setColor(COLORS[doc.tracks.length % 6]);
                        }}
                      >
                        <Plus size={15} />
                      </button>
                    </span>
                  </div>
                  {doc.tracks.map((t, i) => (
                    <div
                      className={
                        "track " + (track.id === t.id ? "selected-track" : "")
                      }
                      key={t.id}
                    >
                      <button
                        className="track-name"
                        onClick={() => setActiveTrack(t.id)}
                      >
                        <span className="track-index">{i + 1}</span>
                        {INSTRUMENTS.find((x) => x.id === t.instrument).name}
                      </button>
                      <div className="track-controls">
                        <IconButton
                          label={
                            (t.muted ? "取消静音" : "静音") + "声部 " + (i + 1)
                          }
                          aria-pressed={t.muted}
                          onClick={() => updateTrack(t.id, { muted: !t.muted })}
                        >
                          {t.muted ? <SpeakerSlash /> : <SpeakerHigh />}
                        </IconButton>
                        <button
                          className="solo"
                          title="独奏此声部"
                          aria-label={"独奏声部 " + (i + 1)}
                          aria-pressed={t.solo}
                          onClick={() => updateTrack(t.id, { solo: !t.solo })}
                        >
                          S
                        </button>
                      </div>
                      <input
                        aria-label={"声部 " + (i + 1) + " 音量"}
                        type="range"
                        min="0"
                        max="1"
                        step=".01"
                        value={t.volume}
                        onChange={(e) =>
                          updateTrack(t.id, { volume: +e.target.value })
                        }
                      />
                      {doc.tracks.length > 1 && (
                        <button
                          className="delete-track"
                          aria-label={"删除声部 " + (i + 1)}
                          onClick={() =>
                            setModal({ type: "delete-track", id: t.id })
                          }
                        >
                          <Trash size={12} />
                        </button>
                      )}
                    </div>
                  ))}
                  <label className="mobile-volume">
                    <SpeakerHigh size={16} />
                    总音量
                    <input
                      aria-label="总音量（触屏）"
                      type="range"
                      min="0"
                      max="1"
                      step=".01"
                      value={volume}
                      onChange={(e) => {
                        setVolume(+e.target.value);
                        player.setVolume(+e.target.value);
                      }}
                    />
                  </label>
                </section>
              </aside>
            </div>
            <footer className="studio-footer">
              <span>
                <span className="tiny-dot" />
                声音在浏览器里生成，灵感留在你手里。
              </span>
              <button onClick={() => setModal("help")}>
                第一次画？看看怎么玩 <ArrowRight size={14} />
              </button>
            </footer>
          </>
        ) : (
          <>
            <section className="library-header">
              <div className="eyebrow">每一笔，都值得留下</div>
              <h1>
                我的作品<span>{library.length}</span>
              </h1>
              <p>收藏随手画出的旋律，让灵感有迹可循。</p>
              <div className="library-controls">
                <label className="search">
                  <MagnifyingGlass />
                  <input
                    aria-label="搜索作品"
                    placeholder="搜索名称、音色或分类…"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button aria-label="清空搜索" onClick={() => setQuery("")}>
                      <X />
                    </button>
                  )}
                </label>
                <select
                  aria-label="作品排序"
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                >
                  <option value="recent">最近修改</option>
                  <option value="title">按名称</option>
                  <option value="tempo">按速度</option>
                </select>
                <button
                  className="subtle-button"
                  onClick={() => importRef.current.click()}
                >
                  <UploadSimple />
                  导入作品
                </button>
              </div>
              <div className="filter-tabs">
                {[
                  "全部作品",
                  "慢慢流动",
                  "轻快律动",
                  "活力节奏",
                  "多声部",
                  "单声部",
                ].map((f) => (
                  <button
                    key={f}
                    className={filter === f ? "active" : ""}
                    onClick={() => setFilter(f)}
                  >
                    {f}
                  </button>
                ))}
              </div>
            </section>
            <div className="library-meta">
              <span>{list.length} 件作品</span>
              <span>按速度、声部与音阶自动归类</span>
            </div>
            {list.length ? (
              <div className="project-grid">
                {list.map((d) => (
                  <article className="project-card" key={d.id}>
                    <button className="project-cover" onClick={() => load(d)}>
                      <Thumbnail doc={d} />
                      <span className="open-project">
                        <Play weight="fill" />
                        继续创作
                      </span>
                    </button>
                    <div className="project-info">
                      <button className="project-title" onClick={() => load(d)}>
                        {d.title}
                      </button>
                      <span className="project-date">
                        {new Date(d.updatedAt).toLocaleDateString("zh-CN", {
                          month: "long",
                          day: "numeric",
                        })}{" "}
                        · {d.bpm} BPM
                      </span>
                      <div className="project-tags">
                        {categories(d)
                          .slice(0, 2)
                          .map((c) => (
                            <span key={c}>{c}</span>
                          ))}
                      </div>
                      <div className="project-actions">
                        <IconButton
                          label={"复制 " + d.title}
                          onClick={() => duplicate(d)}
                        >
                          <Copy size={16} />
                        </IconButton>
                        <IconButton
                          label={"删除 " + d.title}
                          onClick={() =>
                            setModal({
                              type: "delete-project",
                              id: d.id,
                              title: d.title,
                            })
                          }
                        >
                          <Trash size={16} />
                        </IconButton>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="library-empty">
                <FolderOpen size={42} weight="light" />
                <h2>
                  {library.length ? "暂时没有匹配的作品" : "让第一段旋律住进来"}
                </h2>
                <p>
                  {library.length
                    ? "换个关键词或分类再找找。"
                    : "在画布上画几笔，点击「保存作品」就能在这里找到。"}
                </p>
                <button
                  className="primary"
                  onClick={() =>
                    library.length
                      ? (setQuery(""), setFilter("全部作品"))
                      : setView("canvas")
                  }
                >
                  {library.length ? "清除筛选" : "去画一段旋律"}
                  <ArrowRight />
                </button>
              </div>
            )}
            <p className="storage-note">
              作品保存在当前设备的浏览器中。导出作品文件，可以备份或带到另一台设备继续创作。
            </p>
          </>
        )}
      </main>
      <input
        ref={importRef}
        type="file"
        accept=".json,.xianji.json,application/json"
        hidden
        onChange={importFile}
      />
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {saveError && (
        <div className="storage-error" role="alert">
          {saveError}
          <button onClick={() => setModal("export")}>导出备份</button>
        </div>
      )}
      {modal === "demos" && (
        <Modal title="从一段旋律开始" close={() => setModal(null)}>
          <div className="mobile-demos">
            {demos.map((d, i) => (
              <button
                key={i}
                onClick={() =>
                  load({
                    ...structuredClone(d),
                    id: uid(),
                    createdAt: Date.now(),
                    updatedAt: Date.now(),
                  })
                }
              >
                <Thumbnail doc={d} />
                <span>
                  {d.title}
                  <small>
                    {d.bpm} BPM · {SCALES[d.scale].name}
                  </small>
                </span>
                <ArrowRight />
              </button>
            ))}
          </div>
        </Modal>
      )}
      {modal === "export" && (
        <Modal title="把旋律带走" close={() => !exporting && setModal(null)}>
          <p className="modal-intro">
            {doc.title} · {doc.bars} 小节 · {doc.bpm} BPM
          </p>
          <div className="export-options">
            {[
              ["wav", "音频 WAV", "导出一轮完整旋律，可直接播放", MusicNotes],
              ["midi", "MIDI 乐谱", "带入其他音乐软件继续编曲", Keyboard],
              [
                "project",
                "弦迹作品文件",
                "保留线条、音色与设置，随时接着画",
                FolderOpen,
              ],
              ["svg", "画布图片 SVG", "把旋律的形状也留下来", PencilSimple],
            ].map(([id, title, sub, Icon]) => (
              <button
                key={id}
                disabled={
                  exporting || (["wav", "midi"].includes(id) && !noteCount)
                }
                onClick={() => exportFile(id)}
              >
                <span className="export-icon">
                  <Icon size={23} />
                </span>
                <span>
                  <b>{title}</b>
                  <small>{sub}</small>
                </span>
                <DownloadSimple size={18} />
              </button>
            ))}
          </div>
          {exporting && <p role="status">正在生成，请稍等…</p>}
          <p className="fine-print">
            MIDI 使用通用乐器映射，导入其他软件后音色可能不同。
          </p>
        </Modal>
      )}
      {modal === "help" && (
        <Modal title="画出来，听见它" close={() => setModal(null)} wide>
          <div className="guide-art">
            <Thumbnail doc={demos[0]} />
            <span>
              <Play weight="fill" size={17} />
              从左到右，让旋律流动
            </span>
          </div>
          <div className="guide-steps">
            <div>
              <b>01</b>
              <h3>画一条线</h3>
              <p>
                横向是时间，越往上音越高。线条交叠，就会一起发声；橡皮可以擦去整条线。
              </p>
            </div>
            <div>
              <b>02</b>
              <h3>给旋律一点颜色</h3>
              <p>
                选一支音色画笔，也可以添加声部叠加乐器。颜色自由选，音色由每个声部决定。
              </p>
            </div>
            <div>
              <b>03</b>
              <h3>按下播放</h3>
              <p>
                播放线按节拍触发线条。切换音阶、速度和发声节奏，听听同一幅画的不同表情。
              </p>
            </div>
          </div>
          <p className="guide-note">
            触屏可以直接画。键盘按空格播放，B 切换画笔，E 切换橡皮，⌘ / Ctrl + Z
            撤销，⌘ / Ctrl + S 保存。也可点击「灵感起点」试画。
          </p>
          <button className="primary" onClick={() => setModal(null)}>
            开始画一段旋律
            <ArrowRight />
          </button>
        </Modal>
      )}
      {modal === "about" && (
        <Modal title="关于弦迹" close={() => setModal(null)}>
          <div className="about-brand">
            <Waveform size={48} weight="light" />
            <h2>弦迹</h2>
            <p>画下线条，留住旋律。</p>
          </div>
          <p className="modal-intro">
            羊子科技出品。声音由浏览器即时合成，作品保存在当前浏览器；无需注册。保存后可改名、复制、搜索，按速度、声部和音阶自动分类。建议定期导出作品文件备份。
          </p>
          <div className="about-links">
            {[
              ["小节", "音乐班排课", "cal"],
              ["NoteType", "把演奏视频变成同步乐谱", "notetype"],
              ["洞洞谱", "收藏、试听与练习哨笛曲谱", "ddp"],
            ].map(([n, s, p]) => (
              <a key={p} href={"/" + p + "/"} target="_blank" rel="noreferrer">
                <span>
                  <b>{n}</b>
                  <small>{s}</small>
                </span>
                <ArrowRight />
              </a>
            ))}
          </div>
        </Modal>
      )}
      {typeof modal === "object" && modal?.type === "delete-project" && (
        <Modal title="删除这件作品？" close={() => setModal(null)}>
          <p className="modal-intro">
            「{modal.title}」会从本机作品集中移除。导出的作品文件仍然保留。
          </p>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>取消</button>
            <button
              className="danger"
              onClick={() => {
                if (doc.id === modal.id) {
                  stop(true);
                  setDoc(createDoc());
                  setHistory([]);
                  setFuture([]);
                }
                setLibrary((l) => l.filter((d) => d.id !== modal.id));
                setModal(null);
                notify("作品已从作品集移除");
              }}
            >
              删除作品
            </button>
          </div>
        </Modal>
      )}
      {typeof modal === "object" && modal?.type === "delete-track" && (
        <Modal title="删除这个声部？" close={() => setModal(null)}>
          <p className="modal-intro">
            这个声部上的所有线条也会删除。你可以用撤销恢复。
          </p>
          <div className="modal-actions">
            <button onClick={() => setModal(null)}>取消</button>
            <button
              className="danger"
              onClick={() => {
                change((d) => ({
                  ...d,
                  tracks: d.tracks.filter((t) => t.id !== modal.id),
                  strokes: d.strokes.filter((s) => s.track !== modal.id),
                }));
                setModal(null);
              }}
            >
              删除声部
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
