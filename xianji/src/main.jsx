import React, { useState, useRef, useEffect, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
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
  Star,
  Palette,
  Stack,
  DotsThree,
  Sparkle,
} from "./icons.jsx";
import {
  INSTRUMENTS,
  SCALES,
  ROOTS,
  uid,
  createDoc,
  makeDemo,
  validateDoc,
  categories,
  duration,
  exportMidi,
} from "./model.mjs";
import {getScoreIndex} from "./score-index.mjs";
import { Player, renderWav } from "./audio.mjs";
import {
  ScoreCanvas,
  Modal,
  DockPanel,
  IconButton,
  TempoInput,
  Thumbnail,
  pathData,
  pigmentFilterMarkup,
} from "./components.jsx";
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
      error: "浏览器中的作品未能读取。可以导入之前导出的作品文件继续。",
    };
  }
}
const initial = readWorkspace(),
  player = new Player(),
  demos = [0, 1, 2].map(makeDemo);
const ICONS = [
  { id: "a", name: "折线冲刺", description: "一笔折线，果断向前" },
  { id: "b", name: "双波交织", description: "两道笔触，交汇成声" },
  { id: "c", name: "声波环", description: "一束声波，穿过共振的环" },
  { id: "d", name: "节奏签名", description: "坚定的起伏，扫出自由的节奏" },
];
const iconSource = (id, size = 128) => `/xianji/icons/study-${id}-${size}.webp`;

const DOCK_QUERY = "(min-width: 1280px) and (min-height: 680px)";
function App() {
  const [wideScreen, setWideScreen] = useState(() => window.matchMedia(DOCK_QUERY).matches);
  const [doc, setDoc] = useState(initial.draft || createDoc()),
    [library, setLibrary] = useState(initial.library || []),
    [activeTrack, setActiveTrack] = useState(null),
    [brushId, setBrushId] = useState(initial.draft?.strokes.at(-1)?.instrument || initial.draft?.tracks[0]?.instrument || "keys"),
    [tool, setTool] = useState("draw"),
    [playing, setPlaying] = useState(true),
    [loop, setLoop] = useState(true),
    [volume, setVolume] = useState(0.65),
    [modal, setModalState] = useState(null),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [filter, setFilter] = useState("全部作品"),
    [sort, setSort] = useState("recent"),
    [history, setHistory] = useState([]),
    [future, setFuture] = useState([]),
    [exporting, setExporting] = useState(false),
    [saveError, setSaveError] = useState(initial.error || ""),
    [savedAt, setSavedAt] = useState(null);
  const importRef = useRef(),
    docRef = useRef(doc),
    erasedRef = useRef(false),
    toastTimer = useRef(),
    eraserTap = useRef(null);
  const dialogTrigger = useRef(null);
  function setModal(next) {
    if (next && (!modal || sidePanel)) dialogTrigger.current = document.activeElement;
    setModalState(next);
  }
  const sidePanel = wideScreen && ["brush", "rhythm", "tracks"].includes(modal);
  const blocking = !!modal && !sidePanel;
  const Panel = sidePanel ? DockPanel : Modal;
  useEffect(() => {
    const media = window.matchMedia(DOCK_QUERY);
    const resize = () => {
      setWideScreen(media.matches);
      if (!media.matches) setModalState(current => ["brush", "rhythm", "tracks"].includes(current) ? null : current);
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  docRef.current = doc;
  const brush = INSTRUMENTS.find(i => i.id === brushId) || INSTRUMENTS[0];
  const color = brush.color;
  const track = doc.tracks.find((t) => t.id === activeTrack) || doc.tracks[0];
  const saved = library.some((d) => d.id === doc.id),
    noteCount = useMemo(() => getScoreIndex(doc).noteCount, [doc]);
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
  function selectBrush(id) {
    setBrushId(id);setTool("draw");
    player.preview({midi: 60, instrument: id, volume: track.volume}).catch(() => {});
  }
  function useEraser() {
    setTool("erase");
    const previous = eraserTap.current, now = performance.now();
    eraserTap.current = {at: now, doc: doc.id, count: doc.strokes.length};
    if (!previous || now - previous.at > 350 || previous.doc !== doc.id || previous.count !== doc.strokes.length) return;
    eraserTap.current = null;
    if (!doc.strokes.length) return;
    const cleared = {...doc, strokes: []};
    player.pause();player.cancelPreview();change(cleared);
    if (playing) player.play(cleared, loop).catch(() => {});
    notify("画布已清空，可撤销");
  }
  function stop(reset = false) {
    player.pause(reset);
    setPlaying(false);
  }
  async function togglePlay() {
    if (playing) {
      stop();
      return;
    }
    try {
      setPlaying(true);
      player.play(doc, loop).catch(() => {
        setPlaying(false);
        notify("声音暂时无法启动，请再试一次");
      });
    } catch {
      notify("声音暂时无法启动，请再点一次播放");
    }
  }
  function undo() {
    if (!history.length) return;
    const prev = history.at(-1);
    setFuture((f) => [doc, ...f]);
    setHistory(history.slice(0, -1));
    setDoc({ ...prev, updatedAt: Date.now() });
  }
  function redo() {
    if (!future.length) return;
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
    setModal(null);
    setBrushId(d.strokes.at(-1)?.instrument || d.tracks[0].instrument);
    setTool("draw");
    setPlaying(true);
    player.play(d, loop).catch(() => {});
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
    let timer, idle;
    const persist = () => {
      if (player.liveStroke) {timer = setTimeout(schedule, 200);return;}
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
    };
    const schedule = () => {
      if (player.liveStroke) {timer = setTimeout(schedule, 200);return;}
      if (window.requestIdleCallback) idle = requestIdleCallback(persist, {timeout: 1500});
      else persist();
    };
    timer = setTimeout(schedule, 600);
    return () => {clearTimeout(timer);if (idle) cancelIdleCallback(idle);};
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
    }
  }, [doc.bpm, doc.bars, doc.division, doc.scale, doc.root]);
  useEffect(() => {
    player.loop = loop;
  }, [loop]);
  useEffect(() => {
    player.onEnd = () => setPlaying(false);
    return () => {
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
      if (
        e.isComposing ||
        e.repeat ||
        e.target.closest("input,select,textarea,[contenteditable]")
      )
        return;
      const key = e.key.toLowerCase(),
        modified = e.ctrlKey || e.metaKey;
      if (!blocking && modified && key === "s") {
        e.preventDefault();
        save();
        return;
      }
      if (!blocking && modified && key === "z") {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if (modified || e.altKey) return;
      if (key === "c" && (!blocking || modal === "brush")) {
        e.preventDefault();
        setModal(modal === "brush" ? null : "brush");
        return;
      }
      if (sidePanel && key === "escape") { setModal(null); return; }
      if (blocking) return;
      if (e.code === "Space") {
        e.preventDefault();
        void togglePlay();
      } else if (key === "b") {
        e.preventDefault();
        setTool("draw");
      } else if (key === "e") {
        e.preventDefault();
        setTool("erase");
      }
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
              `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 560"><defs>${pigmentFilterMarkup("crayon")}</defs><rect width="1000" height="560" fill="#faf9f6"/><g filter="url(#crayon)">${lines}</g></svg>`,
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
                [...d.tracks, ...d.strokes.filter(s => s.instrument)]
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

  const [icon, setIcon] = useState(() => {
    try {
      const id = localStorage.getItem("xianji.icon.v2");
      return ICONS.some((i) => i.id === id) ? id : "d";
    } catch {
      return "d";
    }
  });
  useEffect(() => {
    document.querySelector('link[rel="icon"]').href = iconSource(icon);
    try {
      localStorage.setItem("xianji.icon.v2", icon);
    } catch {}
  }, [icon]);
  useEffect(() => {
    player.play(docRef.current, true).catch(() => {});
    return () => player.pause();
  }, []);
  function activateAudio() {
    if (playing) player.activate().catch(() => {});
  }
  const dialogTitle =
    typeof modal === "object" && modal
      ? modal.type === "delete-track"
        ? "删除这个声部？"
        : "删除这件作品？"
      : {
          brush: "画笔与音色",
          rhythm: "旋律规则",
          tracks: "声部混音",
          library: "我的作品",
          project: "画布与文件",
          export: "把旋律带走",
          icons: "选一个图标",
          demos: "从一段旋律开始",
          help: "画出来，听见它",
        }[modal];
  function addTrack() {
    if (doc.tracks.length >= 12) return;
    const t = {
      id: uid(),
      instrument: INSTRUMENTS[doc.tracks.length % INSTRUMENTS.length].id,
      volume: 0.65,
      muted: false,
      solo: false,
    };
    change((d) => ({ ...d, tracks: [...d.tracks, t] }));
    setActiveTrack(t.id);
    setBrushId(t.instrument);
  }
  function useDemo(d) {
    load({
      ...structuredClone(d),
      id: uid(),
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }
  return (
    <div className={"workspace" + (sidePanel ? " has-panel" : "")} data-modal-open={blocking}>
      <main
        className="workbench"
        inert={blocking ? true : undefined}
        onPointerDownCapture={activateAudio}
        aria-label="音乐创作空间"
      >
        <ScoreCanvas
          doc={doc}
          track={track}
          instrument={brush.id}
          color={color}
          width={3}
          tool={tool}
          playing={playing}
          visualActive={!blocking}
          player={player}
          onInteract={() => {eraserTap.current = null;activateAudio();}}
          onStroke={(s) =>
            change((d) => ({ ...d, strokes: [...d.strokes, s] }))
          }
          onErase={erase}
          onLimit={() => notify("这张画布已满，请保存后新建一张")}
        />
        <div className="floating-header">
          <button
            className="canvas-menu glass"
            aria-label="画布菜单"
            title="画布与文件"
            onClick={() => setModal("project")}
          >
            <img src={iconSource(icon)} alt="" />
            <CaretDown size={12} />
          </button>
          <div className="top-right glass">
            <IconButton label="我的作品" onClick={() => setModal("library")}>
              <FolderOpen />
            </IconButton>
            <IconButton label="保存作品" onClick={save}>
              <FloppyDisk />
            </IconButton>
            <IconButton label="导出" onClick={() => setModal("export")}>
              <DownloadSimple />
            </IconButton>
          </div>
        </div>
        <div className="floating-tools glass">
          <IconButton label="撤销" disabled={!history.length} onClick={undo}>
            <ArrowCounterClockwise />
          </IconButton>
          <IconButton label="重做" disabled={!future.length} onClick={redo}>
            <ArrowClockwise />
          </IconButton>
        </div>
        <div className="dock-wrap">
          <div className="dock glass" role="toolbar" aria-label="创作工具">
            <IconButton
              label="画笔 (B)"
              aria-keyshortcuts="B"
              aria-pressed={tool === "draw"}
              onClick={() => setTool("draw")}
            >
              <PencilSimple weight={tool === "draw" ? "fill" : "regular"} />
            </IconButton>
            <IconButton
              label="橡皮擦 (E)"
              aria-keyshortcuts="E"
              aria-pressed={tool === "erase"}
              onClick={useEraser}
              title="橡皮擦 (E) · 双击清空画布"
            >
              <Eraser weight={tool === "erase" ? "fill" : "regular"} />
            </IconButton>
            <button
              className="brush-button"
              aria-label="画笔与音色"
              title="画笔与音色 (C)"
              aria-keyshortcuts="C"
              onClick={() => setModal("brush")}
            >
              <span style={{ background: color }} />
              <CaretDown size={11} />
            </button>
            <span className="dock-divider" />
            <button
              className={"play-button " + (playing ? "is-playing" : "")}
              aria-label={playing ? "暂停" : "播放"}
              aria-keyshortcuts="Space"
              title={playing ? "暂停 (空格)" : "播放 (空格)"}
              onClick={togglePlay}
            >
              {playing ? <Pause weight="fill" /> : <Play weight="fill" />}
            </button>
            <span className="dock-divider" />
            <IconButton label="声部混音" onClick={() => setModal("tracks")}>
              <Stack />
            </IconButton>
            <IconButton label="旋律规则" onClick={() => setModal("rhythm")}>
              <SlidersHorizontal />
            </IconButton>
          </div>
          <div className="dock-caption">
            <span className={playing ? "playing-dot" : "paused-dot"} />
            {playing ? "让旋律流动" : "停在这一刻"}
            <span className="caption-divider" />
            {doc.bpm} BPM
            <span className="caption-divider" />
            {SCALES[doc.scale].name}
          </div>
        </div>
        <div className="corner-state">
          <span>{doc.strokes.length} 条线</span>
          <span className="state-separator" />
          {saveError ? (
            <button onClick={() => setModal("export")}>导出备份</button>
          ) : (
            <span>{savedAt ? "已自动保存" : "正在保存"}</span>
          )}
        </div>
      </main>
      <input
        ref={importRef}
        type="file"
        accept=".json,.xianji.json,application/json"
        hidden
        onChange={importFile}
      />
      <AnimatePresence>
        {toast && (
          <motion.div key={toast} className="toast" role="status">
            <Check size={16} />
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
      {saveError && (
        <div className="storage-error" role="alert">
          {saveError}
          <button onClick={() => setModal("export")}>导出备份</button>
        </div>
      )}
      <AnimatePresence>
        {modal && (
          <Panel
            key={sidePanel ? "workbench-panel" : "workbench-dialog"}
            returnFocus={dialogTrigger}
            title={dialogTitle}
            subtitle={
              modal === "icons"
                ? "四种「涂鸦 × 声波」的相遇方式。点一下，试试看。"
                : modal === "library"
                  ? "旋律留在本机，灵感随时继续。"
                  : undefined
            }
            wide={["library", "icons", "help"].includes(modal)}
            dismissible={!exporting}
            close={() => !exporting && setModal(null)}
          >
            {modal === "project" && (
              <>
                <div className="project-name">
                  <label htmlFor="document-title">这幅画的名字</label>
                  <input
                    id="document-title"
                    aria-label="作品名称"
                    maxLength="80"
                    value={doc.title}
                    onChange={(e) =>
                      change((d) => ({ ...d, title: e.target.value }), false)
                    }
                  />
                  <span>
                    <span className="saved-dot" />
                    {saved ? "作品已保存" : "草稿自动保留"} · {doc.bars} 小节
                  </span>
                </div>
                <div className="action-grid">
                  <button onClick={newDoc}>
                    <Plus />
                    <span>
                      新建画布<small>从一张空白开始</small>
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      save();
                      setModal(null);
                    }}
                  >
                    <FloppyDisk />
                    <span>
                      保存作品<small>收进本机作品集</small>
                    </span>
                  </button>
                  <button onClick={() => importRef.current.click()}>
                    <UploadSimple />
                    <span>
                      导入作品<small>接着上次的灵感</small>
                    </span>
                  </button>
                  <button onClick={() => setModal("export")}>
                    <DownloadSimple />
                    <span>
                      导出<small>声音、图片与作品文件</small>
                    </span>
                  </button>
                </div>
                <div className="menu-links">
                  <button onClick={() => setModal("demos")}>
                    <Sparkle />
                    <span>灵感示例</span>
                    <ArrowRight />
                  </button>
                  <button onClick={() => setModal("icons")}>
                    <Palette />
                    <span>图标方案</span>
                    <span className="new-label">4 个方向</span>
                    <ArrowRight />
                  </button>
                  <button onClick={() => setModal("help")}>
                    <Question />
                    <span>怎么玩</span>
                    <ArrowRight />
                  </button>
                </div>
              </>
            )}
            {modal === "brush" && (
              <>
                <section className="panel-section">
                  <div className="section-heading">
                    <h2>这一笔的颜色</h2>
                    <span>一种颜色，一种声音</span>
                  </div>
                  <div className="color-options">
                    {INSTRUMENTS.map((i) => (
                      <button
                        key={i.id}
                        className="color-swatch"
                        style={{ "--swatch": i.color }}
                        aria-label={"画笔颜色 " + i.color}
                        title={i.name}
                        aria-description={i.name}
                        aria-pressed={brush.id === i.id}
                        onClick={() => selectBrush(i.id)}
                      >
                        {brush.id === i.id && <Check weight="bold" />}
                      </button>
                    ))}
                  </div>
                </section>
                <section className="panel-section">
                  <div className="section-heading">
                    <h2>这一笔的声音</h2>
                    <span>声部 {doc.tracks.indexOf(track) + 1}</span>
                  </div>
                  <div className="instrument-grid">
                    {INSTRUMENTS.map((i) => (
                      <button
                        key={i.id}
                        className={brush.id === i.id ? "chosen" : ""}
                        aria-pressed={brush.id === i.id}
                        title={i.description}
                        aria-label={i.name + " " + i.description}
                        onClick={() => selectBrush(i.id)}
                      >
                        <span className="instrument-color" style={{background: i.color}} aria-hidden="true" />
                        <img className="instrument-drawing" src={"/xianji/instruments/" + i.id + ".svg"} alt="" />
                        <span>
                          {i.name}
                          <small>{i.continuous ? "连音" : "触键"}</small>
                        </span>
                        {brush.id === i.id && <Check size={17} />}
                      </button>
                    ))}
                  </div>
                </section>
                <p className="fine-print">
                  点颜色或乐器即可切换画笔。每条线保留落笔时的音色；声部可单独调音量、静音和独奏。
                </p>
                <button className="primary full" onClick={() => setModal(null)}>
                  回到画布
                  <PencilSimple />
                </button>
              </>
            )}
            {modal === "rhythm" && (
              <>
                <div className="tempo-feature">
                  <Metronome size={24} />
                  <div>
                    <TempoInput
                      value={doc.bpm}
                      onChange={(n) => change((d) => ({ ...d, bpm: n }))}
                    />
                    <span>BPM</span>
                  </div>
                  <div className="tempo-steps">
                    <button
                      aria-label="加快速度"
                      disabled={doc.bpm >= 200}
                      onClick={() => change((d) => ({ ...d, bpm: d.bpm + 1 }))}
                    >
                      +
                    </button>
                    <button
                      aria-label="减慢速度"
                      disabled={doc.bpm <= 40}
                      onClick={() => change((d) => ({ ...d, bpm: d.bpm - 1 }))}
                    >
                      −
                    </button>
                  </div>
                </div>
                <input
                  className="tempo-range"
                  aria-label="滑动调整速度"
                  type="range"
                  min="40"
                  max="200"
                  value={doc.bpm}
                  onChange={(e) =>
                    change((d) => ({ ...d, bpm: +e.target.value }))
                  }
                />
                <div className="settings-list">
                  <label>
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
                  <label>
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
                  <label>
                    画布长度
                    <select
                      aria-label="画布长度"
                      value={doc.bars}
                      onChange={(e) =>
                        change((d) => ({ ...d, bars: +e.target.value }))
                      }
                    >
                      {[2, 4, 8].map((n) => (
                        <option key={n} value={n}>
                          {n} 小节
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
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
                </div>
                <button
                  className="toggle-row"
                  aria-pressed={loop}
                  onClick={() => setLoop(!loop)}
                >
                  <Repeat />
                  <span>
                    循环播放<small>让同一幅画，一圈圈流动</small>
                  </span>
                  <span className={"switch " + (loop ? "on" : "")}>
                    <i />
                  </span>
                </button>
                <button
                  className="secondary full"
                  onClick={() => {
                    player.pause(true);
                    if (playing) player.play(doc, loop).catch(() => {});
                  }}
                >
                  从头开始
                  <ArrowCounterClockwise />
                </button>
              </>
            )}
            {modal === "tracks" && (
              <>
                <div className="section-heading">
                  <h2>叠一层声音</h2>
                  <button
                    className="text-button"
                    aria-label="添加声部"
                    disabled={doc.tracks.length >= 12}
                    onClick={addTrack}
                  >
                    <Plus />
                    添加声部
                  </button>
                </div>
                <div className="tracks-list">
                  {doc.tracks.map((t, i) => (
                    <div
                      className={
                        "track " + (track.id === t.id ? "selected-track" : "")
                      }
                      key={t.id}
                    >
                      <button
                        className="track-name"
                        onClick={() => {setActiveTrack(t.id);setBrushId(doc.strokes.filter(s => s.track === t.id).at(-1)?.instrument || t.instrument);}}
                      >
                        <span className="track-index">
                          {String(i + 1).padStart(2, "0")}
                        </span>
                        <span>
                          {new Set(doc.strokes.filter(s => s.track === t.id).map(s => s.instrument || t.instrument)).size > 1 ? "彩虹声部 " + (i + 1) : INSTRUMENTS.find(x => x.id === (doc.strokes.find(s => s.track === t.id)?.instrument || t.instrument)).name}
                          <small>
                            {doc.strokes.filter((s) => s.track === t.id).length}{" "}
                            条线{track.id === t.id ? " · 正在使用" : ""}
                          </small>
                        </span>
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
                          aria-label={"独奏声部 " + (i + 1)}
                          aria-pressed={t.solo}
                          onClick={() => updateTrack(t.id, { solo: !t.solo })}
                        >
                          S
                        </button>
                        {doc.tracks.length > 1 && (
                          <IconButton
                            label={"删除声部 " + (i + 1)}
                            onClick={() =>
                              setModal({ type: "delete-track", id: t.id })
                            }
                          >
                            <Trash />
                          </IconButton>
                        )}
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
                    </div>
                  ))}
                </div>
                <label className="master-volume">
                  <SpeakerHigh />
                  <span>总音量</span>
                  <input
                    aria-label="总音量"
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
                <div className="split-actions">
                  <button
                    className="secondary"
                    onClick={() => setModal("brush")}
                  >
                    选择彩虹画笔
                    <Waveform />
                  </button>
                  <button className="primary" onClick={() => setModal(null)}>
                    继续画
                    <PencilSimple />
                  </button>
                </div>
              </>
            )}
            {modal === "library" && (
              <>
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
                      <IconButton label="清空搜索" onClick={() => setQuery("")}>
                        <X />
                      </IconButton>
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
                {list.length ? (
                  <div className="project-grid">
                    {list.map((d) => (
                      <article className="project-card" key={d.id}>
                        <button
                          className="project-cover"
                          aria-label={"打开 " + d.title}
                          onClick={() => load(d)}
                        >
                          <Thumbnail doc={d} />
                        </button>
                        <div className="project-info">
                          <button
                            className="project-title"
                            onClick={() => load(d)}
                          >
                            {d.title}
                          </button>
                          <span className="project-date">
                            {d.bpm} BPM ·{" "}
                            {categories(d).slice(0, 2).join(" · ")}
                          </span>
                          <div className="project-actions">
                            <IconButton
                              label={"复制 " + d.title}
                              onClick={() => duplicate(d)}
                            >
                              <Copy />
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
                              <Trash />
                            </IconButton>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="library-empty">
                    <FolderOpen size={35} weight="light" />
                    <h2>
                      {library.length
                        ? "暂时没有匹配的作品"
                        : "让第一段旋律住进来"}
                    </h2>
                    <p>
                      {library.length
                        ? "试试换个关键词或分类。"
                        : "随手画一笔，再把喜欢的旋律保存下来。"}
                    </p>
                  </div>
                )}
                <div className="library-footer">
                  <button
                    className="text-button"
                    onClick={() => importRef.current.click()}
                  >
                    <UploadSimple />
                    导入作品
                  </button>
                  <span>按速度、声部与音阶自动归类</span>
                </div>
              </>
            )}
            {modal === "export" && (
              <>
                <p className="modal-intro">
                  {doc.title} · {doc.bars} 小节 · {doc.bpm} BPM
                </p>
                <div className="export-options">
                  {[
                    [
                      "wav",
                      "音频 WAV",
                      "一轮完整旋律，可以直接播放",
                      MusicNotes,
                    ],
                    ["midi", "MIDI 乐谱", "带入音乐软件，继续编曲", Keyboard],
                    [
                      "project",
                      "可编辑作品文件",
                      "保留线条、音色与设置",
                      FolderOpen,
                    ],
                    ["svg", "画布图片 SVG", "把旋律的形状留下来", PencilSimple],
                  ].map(([id, title, sub, Icon]) => (
                    <button
                      key={id}
                      disabled={
                        exporting ||
                        (["wav", "midi"].includes(id) && !noteCount)
                      }
                      onClick={() => exportFile(id)}
                    >
                      <span className="export-icon">
                        <Icon />
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
                  作品保存在当前浏览器中。导出作品文件，可用于备份或换设备继续创作。
                </p>
              </>
            )}
            {modal === "icons" && (
              <>
                <div className="icon-gallery">
                  {ICONS.map((item, index) => (
                    <button
                      key={item.id}
                      className={
                        "icon-choice " + (icon === item.id ? "selected" : "")
                      }
                      aria-label={
                        "方案 " + item.id.toUpperCase() + " " + item.name
                      }
                      aria-pressed={icon === item.id}
                      onClick={() => setIcon(item.id)}
                    >
                      <div className="icon-preview">
                        <img
                          src={iconSource(item.id, 256)}
                          alt={item.name}
                        />
                        <span className="small-icon">
                          <img
                            src={iconSource(item.id)}
                            alt=""
                          />
                        </span>
                      </div>
                      <span className="icon-choice-title">
                        <span>
                          <b>{item.id.toUpperCase()}</b>
                          {item.name}
                        </span>
                        {icon === item.id && <Check />}
                      </span>
                      <small>{item.description}</small>
                    </button>
                  ))}
                </div>
                <div className="icon-footer">
                  <span>可直接切换预览，也可以告诉我你喜欢哪一案。</span>
                  <button
                    className="text-button"
                    onClick={() => {
                      const a = document.createElement("a");
                      a.href = iconSource(icon, 256);
                      a.download = "icon-" + icon + ".webp";
                      a.click();
                    }}
                  >
                    <DownloadSimple />
                    下载当前方案
                  </button>
                </div>
              </>
            )}
            {modal === "demos" && (
              <div className="demo-list">
                {demos.map((d, i) => (
                  <button key={i} onClick={() => useDemo(d)}>
                    <div className="demo-art">
                      <Thumbnail doc={d} />
                    </div>
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
            )}
            {modal === "help" && (
              <>
                <div className="guide-art">
                  <Thumbnail doc={demos[0]} />
                </div>
                <div className="guide-steps">
                  <div>
                    <span>01</span>
                    <h2>直接画</h2>
                    <p>
                      从左到右是时间，越往上音越高。画下的线，会跟着节拍循环。
                    </p>
                  </div>
                  <div>
                    <span>02</span>
                    <h2>叠一点声音</h2>
                    <p>
                      换一种颜色，就是另一种乐器。多画几笔，就能让不同的声音叠起来。
                    </p>
                  </div>
                  <div>
                    <span>03</span>
                    <h2>留住这一刻</h2>
                    <p>
                      草稿自动保留。喜欢的旋律可以收进作品集，或导出成声音与图片。
                    </p>
                  </div>
                </div>
                <p className="fine-print">
                  空格播放 / 暂停 · B 画笔 · E 橡皮 · C 颜色面板 · ⌘ / Ctrl + Z
                  撤销 · ⌘ / Ctrl + S 保存。羊子科技出品。
                </p>
                <button className="primary full" onClick={() => setModal(null)}>
                  回到画布
                  <ArrowRight />
                </button>
              </>
            )}
            {typeof modal === "object" && modal.type === "delete-project" && (
              <>
                <p className="modal-intro">
                  「{modal.title}」会从本机作品集中移除。
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary"
                    onClick={() => setModal("library")}
                  >
                    取消
                  </button>
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
                      setModal("library");
                      notify("作品已从作品集移除");
                    }}
                  >
                    删除作品
                  </button>
                </div>
              </>
            )}
            {typeof modal === "object" && modal.type === "delete-track" && (
              <>
                <p className="modal-intro">
                  这个声部上的线条也会删除，可以用撤销恢复。
                </p>
                <div className="modal-actions">
                  <button
                    className="secondary"
                    onClick={() => setModal("tracks")}
                  >
                    取消
                  </button>
                  <button
                    className="danger"
                    onClick={() => {
                      change((d) => ({
                        ...d,
                        tracks: d.tracks.filter((t) => t.id !== modal.id),
                        strokes: d.strokes.filter((s) => s.track !== modal.id),
                      }));
                      setModal("tracks");
                    }}
                  >
                    删除声部
                  </button>
                </div>
              </>
            )}
          </Panel>
        )}
      </AnimatePresence>
    </div>
  );
}
createRoot(document.getElementById("root")).render(
  <MotionConfig reducedMotion="user">
    <App />
  </MotionConfig>,
);
