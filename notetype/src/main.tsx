import React, { useEffect, useRef, useState, useMemo } from "react";
import { createRoot } from "react-dom/client";
import { Player, type PlayerRef } from "@remotion/player";
import {
  MusicNotes,
  ArrowUpRight,
  UploadSimple,
  Play,
  ArrowRight,
  DownloadSimple,
  Check,
  SpinnerGap,
  Waveform,
  FilmStrip,
  SlidersHorizontal,
  Info,
  X,
  ArrowCounterClockwise,
  MusicNote,
  CheckCircle,
} from "@phosphor-icons/react";
import { Film, pitchName } from "./Film";
import { MatchStep } from "./MatchStep";
import type { FilmProps, Job, Note } from "./types";
import "./style.css";
const base = "/notetype";
const emptyNotes: Note[] = [];
const melody = [60, 62, 64, 65, 67, 69, 71, 72, 72, 71, 69, 67, 65, 64, 62, 60];
const demoNotes = melody.map((pitch, i) => ({
  id: "demo-" + i,
  pitch,
  start: 0.5 + i * 0.55,
  end: 0.5 + i * 0.55 + 0.43,
  confidence: 1,
}));
const demo: FilmProps = {
  src: base + "/demo.mp4",
  notes: demoNotes,
  title: "让音阶慢慢落在纸上",
  duration: 10,
  offset: 0,
  theme: "paper",
  labels: true,
  demo: true,
};
const stamp = (s: number) =>
  `${Math.floor(s / 60)
    .toString()
    .padStart(2, "0")}:${Math.floor(s % 60)
    .toString()
    .padStart(2, "0")}`;
async function api(path: string, options?: RequestInit) {
  const res = await fetch(base + "/api" + path, options);
  const body = await res.json();
  if (!res.ok) throw Error(body.error || "请求未完成，请稍后重试");
  return body;
}
function App() {
  const [job, setJob] = useState<Job | null>(null),
    [uploading, setUploading] = useState(false),
    [uploadPct, setUploadPct] = useState(0),
    [error, setError] = useState(""),
    [drag, setDrag] = useState(false),
    [title, setTitle] = useState("我的演奏"),
    [theme, setTheme] = useState<"paper" | "night">("paper"),
    [labels, setLabels] = useState(true),
    [offset, setOffset] = useState(0),
    [notes, setNotes] = useState<Note[]>([]),
    [time, setTime] = useState(0),
    [help, setHelp] = useState(false),
    [editing, setEditing] = useState(false),
    [selected, setSelected] = useState("");
  const fileRef = useRef<HTMLInputElement>(null),
    player = useRef<PlayerRef>(null);
  const busy =
    uploading ||
    (!!job &&
      [
        "queued",
        "extracting",
        "transcribing",
        "matching",
        "aligning",
        "rendering",
      ].includes(job.status));
  const ready = !!job && ["ready", "done"].includes(job.status);
  const hasSource = !!job?.src && job.duration > 0;
  const shouldShowNotes = ready || job?.status === "rendering";
  const film: FilmProps = useMemo(
    () =>
      hasSource && job
        ? {
            src: job.src,
            notes: shouldShowNotes ? notes : emptyNotes,
            title,
            duration: job.duration,
            offset,
            theme,
            labels,
          }
        : { ...demo, theme, labels },
    [
      hasSource,
      shouldShowNotes,
      job?.src,
      job?.duration,
      notes,
      title,
      offset,
      theme,
      labels,
    ],
  );
  useEffect(() => {
    const p = player.current;
    if (!p) return;
    const update = ({ detail }: { detail: { frame: number } }) => {
      if (detail.frame % 3 === 0) setTime(detail.frame / 30);
    };
    p.addEventListener("frameupdate", update);
    return () => p.removeEventListener("frameupdate", update);
  }, [job?.id, ready]);
  useEffect(() => {
    if (
      !job ||
      ![
        "queued",
        "extracting",
        "transcribing",
        "matching",
        "aligning",
        "rendering",
      ].includes(job.status)
    )
      return;
    let stop = false;
    const tick = async () => {
      try {
        const next: Job = await api("/jobs/" + job.id);
        if (stop) return;
        setJob(next);
        if (
          ["ready", "done"].includes(next.status) &&
          job.status !== "rendering"
        )
          setNotes(next.notes);
        if (next.error) setError(next.error || next.message);
      } catch (e) {
        if (!stop) setError((e as Error).message);
      }
    };
    const timer = setInterval(tick, 1800);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, [job?.id, job?.status]);
  useEffect(() => {
    if (job?.status === "choose")
      document.querySelector(".match-panel")?.scrollIntoView({
        block: "start",
        behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "instant"
          : "smooth",
      });
  }, [job?.status]);
  async function upload(file?: File) {
    if (!file || busy) return;
    if (file.size > 80 * 1024 * 1024) {
      setError("视频超过 80 MB，请先裁剪或压缩。");
      return;
    }
    if (!/\.(mp4|mov|webm|m4v)$/i.test(file.name)) {
      setError("请选择 MP4、MOV、WebM 或 M4V 视频。");
      return;
    }
    setError("");
    setUploading(true);
    setUploadPct(0);
    setTitle(file.name.replace(/\.[^.]+$/, "").slice(0, 50));
    setOffset(0);
    try {
      const data = new FormData();
      data.append("video", file);
      const next = await new Promise<Job>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", base + "/api/jobs");
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable)
            setUploadPct(Math.round((e.loaded / e.total) * 100));
        };
        xhr.onload = () => {
          try {
            const b = JSON.parse(xhr.responseText);
            xhr.status < 300
              ? resolve(b)
              : reject(Error(b.error || "上传未完成"));
          } catch {
            reject(Error("上传未完成，请检查网络"));
          }
        };
        xhr.onerror = () => reject(Error("网络连接中断，请重新上传"));
        xhr.send(data);
      });
      setJob(next);
      setNotes([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }
  async function runDemo() {
    if (busy) return;
    setError("");
    setUploading(true);
    setTitle("C 大调音阶练习");
    setOffset(0);
    try {
      setJob(await api("/demo", { method: "POST" }));
      setNotes([]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function render() {
    if (!ready || !job) return;
    setError("");
    try {
      const next = await api("/jobs/" + job.id + "/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, notes, offset, theme, labels }),
      });
      setJob(next);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("notetype-job-v1");
      if (!raw) return;
      const saved = JSON.parse(raw);
      api("/jobs/" + saved.id)
        .then((next: Job) => {
          setJob(next);
          setTitle(saved.title || "我的演奏");
          setNotes(
            (saved.referenceId || "draft") ===
              (next.reference?.id || "draft") && saved.notes?.length
              ? saved.notes
              : next.notes,
          );
          setOffset(saved.offset || 0);
          setTheme(saved.theme === "night" ? "night" : "paper");
          setLabels(saved.labels !== false);
        })
        .catch(() => sessionStorage.removeItem("notetype-job-v1"));
    } catch {}
  }, []);
  useEffect(() => {
    if (job)
      try {
        sessionStorage.setItem(
          "notetype-job-v1",
          JSON.stringify({
            id: job.id,
            referenceId: job.reference?.id || "draft",
            title,
            notes,
            offset,
            theme,
            labels,
          }),
        );
      } catch {}
  }, [job?.id, job?.reference?.id, title, notes, offset, theme, labels]);
  function reset() {
    sessionStorage.removeItem("notetype-job-v1");
    player.current?.pause();
    setJob(null);
    setNotes([]);
    setError("");
    setEditing(false);
    setTime(0);
    setOffset(0);
  }
  const current = notes.filter(
    (n) => time - offset >= n.start && time - offset < n.end,
  );
  return (
    <>
      <header className="header">
        <a href={base + "/"} className="brand" aria-label="NoteType 首页">
          <span className="brand-icon">
            <MusicNotes weight="fill" size={23} />
          </span>
          notetype
          <span className="brand-divider" />
          <span className="brand-cn">把音乐，写进画面</span>
        </a>
        <button className="help-link" onClick={() => setHelp(true)}>
          使用指南 <ArrowUpRight size={16} />
        </button>
      </header>
      <main>
        <section className="intro">
          <div className="intro-kicker">
            <span />
            给每一次演奏，一份看得见的旋律
          </div>
          <h1>
            让演奏，<span>跃然谱上。</span>
          </h1>
          <p>
            上传演奏视频，让音符随着音乐落在五线谱上。
            <br className="mobile-break" />
            一段演奏，一支会写谱的视频。
          </p>
        </section>
        {job && (
          <MatchStep
            key={job.id}
            job={job}
            onJob={setJob}
            onNotes={setNotes}
            onError={setError}
            onTitle={setTitle}
          />
        )}
        <div className="workspace">
          <aside className="sidebar">
            <div className="panel-title">
              <span className="step-number">01</span>
              <h2>你的演奏</h2>
              <span className="subtle">从这里开始</span>
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="video/mp4,video/quicktime,video/webm,.m4v"
              hidden
              onChange={(e) => upload(e.target.files?.[0])}
            />
            <button
              disabled={busy}
              className={"upload-zone " + (drag ? "dragging" : "")}
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDrag(true);
              }}
              onDragLeave={() => setDrag(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDrag(false);
                upload(e.dataTransfer.files[0]);
              }}
            >
              <span className="upload-icon">
                <UploadSimple size={26} />
              </span>
              <strong>
                {uploading
                  ? "正在上传 " + uploadPct + "%"
                  : job
                    ? "更换演奏视频"
                    : "点击上传，或将视频拖到这里"}
              </strong>
              <span>MP4 / MOV / WebM / M4V</span>
              <small>60 秒以内 · 最大 80 MB</small>
            </button>
            <button className="demo-button" disabled={busy} onClick={runDemo}>
              <Play size={15} weight="fill" /> 先用音阶示例试一试{" "}
              <ArrowRight size={16} />
            </button>
            {job && (
              <div className="job-status" role="status">
                <div>
                  {busy ? (
                    <SpinnerGap className="spin" size={18} />
                  ) : job.status === "error" ? (
                    <Info size={18} />
                  ) : (
                    <CheckCircle size={18} />
                  )}
                  <strong>{job.message}</strong>
                </div>
                {busy && <progress max={100} value={job.progress} />}
                <small>{job.name}</small>
              </div>
            )}
            <div className="panel-title second">
              <span className="step-number">03</span>
              <h2>画面设置</h2>
              <SlidersHorizontal size={18} />
            </div>
            <label className="field-label" htmlFor="title">
              作品标题
            </label>
            <input
              id="title"
              className="title-input"
              value={hasSource ? title : demo.title}
              disabled={!ready || busy}
              maxLength={50}
              onChange={(e) => setTitle(e.target.value)}
            />
            <div className="field-label theme-label">发光颜色</div>
            <div className="theme-options">
              <button
                className={
                  "theme-option paper " + (theme === "paper" ? "chosen" : "")
                }
                disabled={busy}
                onClick={() => setTheme("paper")}
              >
                <span className="mini-score">♩ &nbsp; ♪ &nbsp; ♩</span>
                <span>柔白 {theme === "paper" && <Check size={13} />}</span>
              </button>
              <button
                className={
                  "theme-option night " + (theme === "night" ? "chosen" : "")
                }
                disabled={busy}
                onClick={() => setTheme("night")}
              >
                <span className="mini-score">♩ &nbsp; ♪ &nbsp; ♩</span>
                <span>青辉 {theme === "night" && <Check size={13} />}</span>
              </button>
            </div>
            <label className="switch-row">
              <span>
                显示音名 <small>C4、D4…</small>
              </span>
              <input
                type="checkbox"
                checked={labels}
                disabled={busy}
                onChange={(e) => setLabels(e.target.checked)}
              />
              <span className="switch" />
            </label>
            <div className="offset-label">
              <label htmlFor="offset">音符同步微调</label>
              <output>
                {offset > 0 ? "+" : ""}
                {offset.toFixed(2)} s
              </output>
            </div>
            <input
              id="offset"
              type="range"
              min={-1}
              max={1}
              step={0.05}
              disabled={!ready || busy}
              value={offset}
              onChange={(e) => setOffset(Number(e.target.value))}
            />
            <div className="range-labels">
              <span>提前 1 秒</span>
              <span>延后 1 秒</span>
            </div>
            <div className="notice">
              <Info size={17} />
              <p>
                清晰的单乐器录音效果更好。识别生成的是音符初稿，支持预览和逐音校正。
              </p>
            </div>
          </aside>
          <section className="studio">
            <div className="studio-bar">
              <div>
                <span className="preview-dot" />
                合成预览{" "}
                <span className="preview-tag">
                  {hasSource ? "你的演奏" : "合成音阶示例"}
                </span>
              </div>
              <span className="format-label">
                3:4 <span>·</span> MP4
              </span>
            </div>
            <div className="player-wrap">
              <Player
                key={hasSource ? job?.id : "demo"}
                ref={player}
                component={Film}
                inputProps={film}
                durationInFrames={Math.max(1, Math.ceil(film.duration * 30))}
                fps={30}
                compositionWidth={960}
                compositionHeight={1280}
                controls
                style={{ width: "100%" }}
                clickToPlay
                doubleClickToFullscreen
                showVolumeControls
              />
            </div>
            <div className="track">
              <div className="track-icon">
                <Waveform size={18} />
              </div>
              <div className="wave-track" aria-label="音符时间线">
                {film.notes.map((n) => (
                  <i
                    key={n.id}
                    className={time - offset >= n.start ? "passed" : ""}
                    style={{
                      left: `${(n.start / film.duration) * 100}%`,
                      width: `${Math.max(0.4, ((n.end - n.start) / film.duration) * 100)}%`,
                      height: 12 + (n.pitch % 14) * 1.6,
                    }}
                  />
                ))}
                <span
                  className="track-cursor"
                  style={{
                    left: `${Math.min(100, (time / film.duration) * 100)}%`,
                  }}
                />
              </div>
              <span className="track-duration">
                {stamp(time)} / {stamp(film.duration)}
              </span>
            </div>
            <div className="preview-caption">
              <span>
                <MusicNote size={16} />
                {shouldShowNotes
                  ? notes.length + " 个音符"
                  : hasSource
                    ? "等待匹配曲目"
                    : "16 个示例音符"}
                <span className="caption-divider" />
                {shouldShowNotes
                  ? current.length
                    ? current.map((n) => pitchName(n.pitch)).join(" · ")
                    : "等待下一个音符"
                  : "原声保留 · 原位发光"}
              </span>
              <span>当前音符原位发光</span>
            </div>
            <div className="export-row">
              <div>
                <h3>
                  {job?.status === "done"
                    ? "作品已准备好"
                    : "你的旋律，值得被看见。"}
                </h3>
                <p>
                  {job?.status === "done"
                    ? "合成视频包含原声与动态五线谱。"
                    : "确认音符和画面后，导出带原声的动态乐谱视频。"}
                </p>
              </div>
              {job?.status === "done" && job.download ? (
                <a className="primary" download href={job.download}>
                  <DownloadSimple size={19} /> 下载 MP4
                </a>
              ) : (
                <button
                  className="primary"
                  disabled={!ready || busy}
                  onClick={render}
                >
                  {job?.status === "rendering" ? (
                    <SpinnerGap className="spin" size={19} />
                  ) : (
                    <FilmStrip size={19} />
                  )}{" "}
                  {job?.status === "rendering"
                    ? "正在合成 " + job.progress + "%"
                    : "导出视频"}{" "}
                  <ArrowUpRight size={16} />
                </button>
              )}
            </div>
            {ready && (
              <div className="edit-actions">
                <button onClick={() => setEditing(!editing)}>
                  {editing ? "收起音符校正" : "校正识别音符"}{" "}
                  <SlidersHorizontal size={15} />
                </button>
                <button onClick={reset}>
                  <ArrowCounterClockwise size={15} /> 开始新作品
                </button>
                {job?.status === "done" && (
                  <button onClick={render}>
                    重新导出当前设置 <ArrowRight size={15} />
                  </button>
                )}
              </div>
            )}
          </section>
        </div>
        {error && (
          <div className="error" role="alert">
            <Info size={18} />
            {error}
            <button aria-label="关闭错误提示" onClick={() => setError("")}>
              <X size={18} />
            </button>
          </div>
        )}
        {editing && ready && (
          <section className="note-editor">
            <div className="editor-heading">
              <h2>
                音符校正 <span>{notes.length} 个音符</span>
              </h2>
              <p>选择音符试听对应位置，修改音高和起止时间后重新导出。</p>
            </div>
            <div className="note-chips">
              {notes.map((n, i) => (
                <button
                  key={n.id}
                  className={selected === n.id ? "selected" : ""}
                  onClick={() => {
                    setSelected(n.id);
                    player.current?.seekTo(
                      Math.floor(Math.max(0, n.start + offset) * 30),
                    );
                  }}
                >
                  <small>{i + 1}</small>
                  {pitchName(n.pitch)}
                  <small>{n.start.toFixed(2)}s</small>
                </button>
              ))}
            </div>
            {notes.find((n) => n.id === selected) &&
              (() => {
                const n = notes.find((n) => n.id === selected)!;
                const change = (
                  key: "pitch" | "start" | "end",
                  value: number,
                ) =>
                  setNotes(
                    notes.map((item) =>
                      item.id === n.id ? { ...item, [key]: value } : item,
                    ),
                  );
                return (
                  <div className="note-fields">
                    <label>
                      音高
                      <select
                        value={n.pitch}
                        onChange={(e) => change("pitch", +e.target.value)}
                      >
                        {Array.from({ length: 88 }, (_, i) => i + 21).map(
                          (p) => (
                            <option key={p} value={p}>
                              {pitchName(p)}
                            </option>
                          ),
                        )}
                      </select>
                    </label>
                    <label>
                      开始（秒）
                      <input
                        type="number"
                        min={0}
                        max={n.end - 0.03}
                        step={0.01}
                        key={n.id + "-start"}
                        defaultValue={n.start}
                        onBlur={(e) => {
                          const v = +e.target.value;
                          if (
                            e.target.value !== "" &&
                            v >= 0 &&
                            v < n.end - 0.02
                          )
                            change("start", v);
                          else e.target.value = String(n.start);
                        }}
                      />
                    </label>
                    <label>
                      结束（秒）
                      <input
                        type="number"
                        min={n.start + 0.03}
                        max={job!.duration}
                        step={0.01}
                        key={n.id + "-end"}
                        defaultValue={n.end}
                        onBlur={(e) => {
                          const v = +e.target.value;
                          if (v > n.start + 0.02 && v <= job!.duration)
                            change("end", v);
                          else e.target.value = String(n.end);
                        }}
                      />
                    </label>
                    <button
                      onClick={() => {
                        setNotes(notes.filter((item) => item.id !== n.id));
                        setSelected("");
                      }}
                    >
                      删除此音符
                    </button>
                  </div>
                );
              })()}
          </section>
        )}
        <div className="workflow">
          <div>
            <span>01</span>
            <UploadSimple size={19} />
            <p>上传一段演奏</p>
          </div>
          <ArrowRight size={18} />
          <div>
            <span>02</span>
            <MusicNotes size={19} />
            <p>匹配曲目与对齐</p>
          </div>
          <ArrowRight size={18} />
          <div>
            <span>03</span>
            <FilmStrip size={19} />
            <p>带着五线谱，分享音乐</p>
          </div>
        </div>
        <footer>
          <span className="footer-brand">
            notetype <span>让音乐留下形状。</span>
          </span>
          <span>原视频与生成文件会在 6 小时后自动清理</span>
        </footer>
      </main>
      {help && (
        <div className="modal-backdrop" onClick={() => setHelp(false)}>
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="guide-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="modal-close"
              aria-label="关闭使用指南"
              onClick={() => setHelp(false)}
            >
              <X size={22} />
            </button>
            <MusicNotes size={34} weight="duotone" />
            <h2 id="guide-title">从演奏，到会动的谱。</h2>
            <p>1. 上传 60 秒以内、80 MB 以内的演奏视频，或点击音阶示例体验。</p>
            <p>
              2.
              等待解析和匹配，在候选曲目中试听并确认版本；也可以输入曲名搜索。无需自行提供曲谱。确认后按演奏速度对齐，可微调整体同步。
            </p>
            <p>
              3.
              如有误识别，展开音符校正，修改音高或起止时间、删除杂音。点击导出视频，等待完成后下载
              MP4。
            </p>
            <div className="guide-note">
              <strong>关于识别和谱面</strong>
              <p>
                先用 Basic Pitch
                提取演奏特征，再与曲库中的音符比对。覆盖古典、中文流行及部分社区旋律谱；钢琴编配和主旋律版本会分别标注。吉他、声乐等可尝试匹配旋律，不保证完整伴奏。曲库未覆盖、改编差异或噪声较大时可能找不到，可明确选择识别初稿。这里是按真实时间排布的双谱表时间谱，每
                4
                秒翻页，时值为近似视觉表示；未推断调号、拍号、小节或休止符，不能替代正式出版乐谱。
              </p>
              <p>
                上传后处理，再同步播放和导出；当前不支持摄像头边演边识谱。输出为
                720 × 960、30 fps 的 MP4，保留原声。视频仅在本服务器处理，文件在
                6 小时后自动删除；请及时下载。
              </p>
              <p>示例为程序合成音阶与键盘画面，用于展示同步效果。</p>
            </div>
            <button className="primary" onClick={() => setHelp(false)}>
              开始创作 <ArrowRight size={17} />
            </button>
          </section>
        </div>
      )}
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
