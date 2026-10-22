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
  Stack,
  DotsThree,
  Sparkle,
  History,
} from "./icons.jsx";
import {
  INSTRUMENTS,
  getInstrument,
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
  FileMenu,
  Modal,
  DockPanel,
  IconButton,
  TempoInput,
  Thumbnail,
  pathData,
  pigmentFilterMarkup,
} from "./components.jsx";
import { beginHistory, recordHistory, nextHistory, packHistory, unpackHistory, historyTitle } from "./history.mjs";
import { readAppearance, applyAppearance } from "./appearance.mjs";
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
    const draft = s.draft ? clean(s.draft) : null;
    const timeline = draft && unpackHistory(s.histories?.[draft.id], draft);
    if (timeline) timeline.entries[timeline.cursor].doc.updatedAt = draft.updatedAt;
    return {
      draft: timeline ? timeline.entries[timeline.cursor].doc : draft,
      timeline,
      histories: s.histories && typeof s.histories === "object" && !Array.isArray(s.histories) ? s.histories : {},
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
const firstDoc = initial.draft || createDoc();

const DOCK_QUERY = "(min-width: 1280px) and (min-height: 680px)";
function App() {
  const [wideScreen, setWideScreen] = useState(() => window.matchMedia(DOCK_QUERY).matches);
  const [doc, setDoc] = useState(firstDoc),
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
    [timeline, setTimeline] = useState(() => initial.timeline || beginHistory(firstDoc)),
    [exporting, setExporting] = useState(false),
    [saveError, setSaveError] = useState(initial.error || ""),
    [savedAt, setSavedAt] = useState(null);
  const timelineRef = useRef(timeline), historiesRef = useRef(Object.assign(Object.create(null),initial.histories || {}));
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
  const sidePanel = wideScreen && ["brush", "rhythm", "tracks", "history"].includes(modal);
  const blocking = !!modal && !sidePanel && modal !== "project";
  const Panel = sidePanel ? DockPanel : Modal;
  useEffect(() => {
    const media = window.matchMedia(DOCK_QUERY);
    const resize = () => {
      setWideScreen(media.matches);
      if (!media.matches) setModalState(current => ["brush", "rhythm", "tracks", "history"].includes(current) ? null : current);
    };
    media.addEventListener("change", resize);
    return () => media.removeEventListener("change", resize);
  }, []);
  docRef.current = doc;
  const brush = getInstrument(brushId) || INSTRUMENTS[0];
  const color = brush.color;
  const track = doc.tracks.find((t) => t.id === activeTrack) || doc.tracks[0];
  const saved = library.some((d) => d.id === doc.id),
    noteCount = useMemo(() => getScoreIndex(doc).noteCount, [doc]);
  const notify = (msg) => {
    setToast(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 3500);
  };
  function setCurrent(next) {
    docRef.current = next;
    setDoc(next);
  }
  function applyTimeline(next) {
    timelineRef.current = next;
    setTimeline(next);
  }
  function change(fn, remember = true) {
    const prev = docRef.current;
    const next = {...(typeof fn === "function" ? fn(prev) : fn), updatedAt: Date.now()};
    if (["title","bpm","bars","division","scale","root","strokes"].every(key => prev[key] === next[key]) &&
      prev.tracks.length === next.tracks.length && prev.tracks.every((t,i) => Object.keys(t).every(key => t[key] === next.tracks[i][key]))) return;
    applyTimeline(recordHistory(timelineRef.current, next, {merge:!remember}));
    setCurrent(next);
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
  function restoreSnapshot(index, {redo=[]}={}) {
    const current = timelineRef.current;
    if (index < 0 || index >= current.entries.length || index === current.cursor) return;
    const restored = {...current.entries[index].doc, updatedAt:Date.now()};
    player.pause();player.cancelPreview();
    applyTimeline({...current,cursor:index,redo});
    setCurrent(restored);
    setActiveTrack(restored.tracks[0].id);
    if (playing) player.play(restored,loop).catch(() => {});
  }
  function undo() {
    const current=timelineRef.current;
    restoreSnapshot(current.entries[current.cursor].parent,{redo:[current.cursor,...(current.redo || [])]});
  }
  function redo() {
    const current=timelineRef.current;
    restoreSnapshot(nextHistory(current),{redo:current.redo?.slice(1) || []});
  }
  function load(d) {
    if (doc.strokes.length && !saved)
      setLibrary((l) =>
        [doc, ...l.filter((x) => x.id !== doc.id)].slice(0, 100),
      );
    historiesRef.current[doc.id] = packHistory(timelineRef.current);
    const restored = unpackHistory(historiesRef.current[d.id],d);
    const next = restored ? restored.entries[restored.cursor].doc : d;
    stop(true);
    setCurrent(next);
    applyTimeline(restored || beginHistory(next));
    setActiveTrack(next.tracks[0].id);
    setModal(null);
    setBrushId(d.strokes.at(-1)?.instrument || d.tracks[0].instrument);
    setTool("draw");
    setPlaying(true);
    player.play(next, loop).catch(() => {});
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
    if (d.title !== doc.title) change(d,false);
    else setCurrent(d);
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
  function persistedHistories() {
    const ids = new Set([docRef.current.id,...library.map(d=>d.id)]);
    historiesRef.current[docRef.current.id] = packHistory(timelineRef.current);
    return Object.fromEntries(Object.entries(historiesRef.current).filter(([id])=>ids.has(id)));
  }
  useEffect(() => {
    let timer, idle;
    const persist = () => {
      if (player.liveStroke) {timer = setTimeout(schedule, 200);return;}
      try {
        const next = library.map((d) => (d.id === doc.id ? doc : d));
        localStorage.setItem(
          STORAGE,
          JSON.stringify({ draft: doc, library: next, histories: persistedHistories() }),
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
  }, [doc, library, timeline]);
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
            histories: persistedHistories(),
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
                    (t) => getInstrument(t.instrument)?.name,
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

  const [appearance, setAppearance] = useState(readAppearance);
  useEffect(() => {
    const system = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => applyAppearance(appearance, system.matches);
    update();
    system.addEventListener("change", update);
    return () => system.removeEventListener("change", update);
  }, [appearance]);
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
          history: "历史记录",
          export: "把旋律带走",
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
            aria-expanded={modal === "project"}
            onClick={() => setModal(modal === "project" ? null : "project")}
          >
            <span>{doc.title || "未命名的旋律"}</span>
            <CaretDown size={12} />
          </button>
          <div className="top-right glass" role="toolbar" aria-label="编辑历史与保存">
            <IconButton label="撤销" disabled={timeline.entries[timeline.cursor].parent < 0} onClick={undo}><ArrowCounterClockwise /></IconButton>
            <IconButton label="历史记录" aria-pressed={modal === "history"} onClick={() => setModal(modal === "history" ? null : "history")}><History /></IconButton>
            <IconButton label="重做" disabled={nextHistory(timeline) < 0} onClick={redo}><ArrowClockwise /></IconButton>
            <IconButton label="保存作品" onClick={save}><FloppyDisk /></IconButton>
          </div>
          <AnimatePresence>
            {modal === "project" && <FileMenu close={() => setModal(null)} returnFocus={dialogTrigger}>
              <label className="file-name-label" htmlFor="document-title">作品名称</label>
              <input id="document-title" aria-label="作品名称" maxLength="80" value={doc.title}
                onChange={e => change(d => ({...d,title:e.target.value}),false)} />
              <div className="file-menu-items">
                <button onClick={newDoc}>新建画布</button>
                <button onClick={() => setModal("library")}>我的作品</button>
                <button onClick={() => importRef.current.click()}>导入作品</button>
                <button onClick={() => setModal("export")}>导出</button>
              </div>
              <section className="appearance-settings" aria-labelledby="appearance-title">
                <h2 id="appearance-title">外观</h2>
                <div className="appearance-options" role="group" aria-label="外观模式">
                  {[["system", "跟随系统"], ["light", "浅色"], ["dark", "暗色"]].map(([value,label]) => (
                    <button key={value} aria-pressed={appearance === value} onClick={() => setAppearance(value)}>{label}</button>
                  ))}
                </div>
              </section>
              <div className="file-menu-items secondary-items">
                <button onClick={() => setModal("demos")}>灵感示例</button>
                <button onClick={() => setModal("help")}>怎么玩</button>
              </div>
            </FileMenu>}
          </AnimatePresence>
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
              <img className="toolbar-instrument" src={"/xianji/instruments/" + brush.id + ".svg"} alt="" />
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
        {modal && modal !== "project" && (
          <Panel
            key={sidePanel ? "workbench-panel" : "workbench-dialog"}
            returnFocus={dialogTrigger}
            title={dialogTitle}
            subtitle={
              modal === "library"
                  ? "旋律留在本机，灵感随时继续。"
                  : undefined
            }
            wide={["library", "help"].includes(modal)}
            dismissible={!exporting}
            close={() => !exporting && setModal(null)}
          >
            {modal === "history" && (
              <div className="history-list" aria-label="操作快照">
                <p className="history-note">点一下，回到这一刻。之前的版本都会保留。</p>
                {timeline.entries.map((entry,index) => {
                  const title = historyTitle(entry, timeline.entries[entry.parent]);
                  return <button key={entry.id} className="history-snapshot" data-snapshot={index + 1} aria-current={index === timeline.cursor ? "step" : undefined}
                    aria-label={"快照 " + (index + 1) + " " + title} onClick={() => restoreSnapshot(index)}>
                    <span className="history-thumbnail"><Thumbnail doc={entry.doc} /></span>
                    <span className="history-description"><b>{title}</b><small>{entry.label} · {entry.doc.strokes.length} 条线 · {new Date(entry.at).toLocaleTimeString("zh-CN",{hour:"2-digit",minute:"2-digit"})}</small></span>
                    <span className="history-step">{index === timeline.cursor ? "当前" : String(index + 1).padStart(2,"0")}</span>
                  </button>;
                }).reverse()}

              </div>
            )}
            {modal === "brush" && (
              <>
                <section className="panel-section">
                  <div className="section-heading">
                    <h2>选一种声音，画出节奏</h2>
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
                          <small>{i.percussion ? "打击" : i.continuous ? "连音" : "触键"}</small>
                        </span>
                        {brush.id === i.id && <Check size={17} />}
                      </button>
                    ))}
                  </div>
                </section>
                <p className="fine-print">
                  点选乐器即可换画笔。每种声音有自己的笔触颜色，鼓和镲片按节拍敲响；声部可单独调音量、静音和独奏。
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
                          {new Set(doc.strokes.filter(s => s.track === t.id).map(s => s.instrument || t.instrument)).size > 1 ? "彩虹声部 " + (i + 1) : getInstrument(doc.strokes.find(s => s.track === t.id)?.instrument || t.instrument).name}
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
                      点选一种乐器，再画几笔，就能叠起不同的声音；底鼓和镲片用来画节奏。
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
                  空格播放 / 暂停 · B 画笔 · E 橡皮 · C 音色面板 · ⌘ / Ctrl + Z
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
                        const empty = createDoc();
                        setCurrent(empty);
                        applyTimeline(beginHistory(empty));
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
