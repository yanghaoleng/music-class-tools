import React, { useEffect, useRef, useState } from "react";
import {
  MusicNotes,
  MagnifyingGlass,
  ArrowRight,
  ArrowUpRight,
  SpinnerGap,
  CheckCircle,
  Play,
  Stop,
  Info,
} from "@phosphor-icons/react";
import type { Job, MatchCandidate } from "./types";
const base = "/notetype/api";
export function MatchStep({
  job,
  onJob,
  onError,
  onNotes,
  onTitle,
}: {
  job: Job;
  onJob: (j: Job) => void;
  onError: (s: string) => void;
  onNotes: (n: Job["notes"]) => void;
  onTitle: (s: string) => void;
}) {
  const [query, setQuery] = useState(""),
    [results, setResults] = useState<MatchCandidate[] | null>(null),
    [count, setCount] = useState(job.matching?.coverage || 0),
    [searching, setSearching] = useState(false),
    [pending, setPending] = useState(""),
    [playing, setPlaying] = useState("");
  const audio = useRef<AudioContext | null>(null);
  const auditionVersion = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      auditionVersion.current++;
      audio.current?.close();
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  useEffect(() => {
    setResults(null);
    setQuery("");
  }, [job.id]);
  useEffect(() => {
    if (job.matching?.coverage) setCount(job.matching.coverage);
    else
      fetch(base + "/catalog")
        .then((r) => r.json())
        .then((r) => {
          if (r.count) setCount(r.count);
        })
        .catch(() => {});
  }, [job.id, job.matching?.coverage]);
  async function request(route: string, payload?: object) {
    const res = await fetch(base + "/jobs/" + job.id + route, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload || {}),
    });
    const body = await res.json();
    if (!res.ok) throw Error(body.error || "请求未完成");
    return body as Job;
  }
  async function choose(item: MatchCandidate) {
    setPending(item.id);
    onError("");
    stop();
    try {
      const next = await request("/match", { scoreId: item.id });
      onJob(next);
      onTitle(item.title);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setPending("");
    }
  }
  async function draft() {
    setPending("draft");
    onError("");
    stop();
    try {
      const next = await request("/use-draft");
      onNotes(next.notes);
      onJob(next);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setPending("");
    }
  }
  async function rematch() {
    setPending("rematch");
    onError("");
    stop();
    try {
      onJob(await request("/rematch"));
      setResults(null);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setPending("");
    }
  }
  async function search(e?: React.FormEvent) {
    e?.preventDefault();
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    onError("");
    try {
      const response = await fetch(
        base + "/catalog?q=" + encodeURIComponent(query.trim()),
      );
      const body = await response.json();
      if (!response.ok) throw Error(body.error);
      setResults(body.items);
      setCount(body.count);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setSearching(false);
    }
  }
  function stop() {
    auditionVersion.current++;
    audio.current?.close().catch(() => {});
    audio.current = null;
    if (timer.current) clearTimeout(timer.current);
    setPlaying("");
  }
  async function audition(item: MatchCandidate) {
    if (playing === item.id) {
      stop();
      return;
    }
    stop();
    setPlaying(item.id);
    const version = auditionVersion.current;
    try {
      const response = await fetch(
        base +
          "/catalog/" +
          encodeURIComponent(item.id) +
          "/preview?beat=" +
          Math.max(0, item.startBeat || 0),
      );
      const data = await response.json();
      if (version !== auditionVersion.current) return;
      if (!response.ok) throw Error(data.error || "试听未完成");
      const context = new AudioContext();
      audio.current = context;
      await context.resume();
      let end = 0;
      for (const n of data.notes) {
        const start = context.currentTime + 0.12 + n.start,
          finish = start + Math.max(0.08, n.end - n.start);
        if (n.start > 8) break;
        const osc = context.createOscillator(),
          gain = context.createGain();
        osc.type = "triangle";
        osc.frequency.value =
          440 * Math.pow(2, (n.pitch + (item.shift || 0) - 69) / 12);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.012);
        gain.gain.exponentialRampToValueAtTime(0.001, finish);
        osc.connect(gain);
        gain.connect(context.destination);
        osc.start(start);
        osc.stop(finish + 0.02);
        end = Math.max(end, n.end);
      }
      timer.current = setTimeout(stop, Math.min(8500, end * 1000 + 400));
    } catch (e) {
      stop();
      onError((e as Error).message);
    }
  }
  const working = ["matching", "aligning"].includes(job.status),
    chosen = ["ready", "done", "rendering"].includes(job.status),
    items = results ?? job.matching?.candidates ?? [];
  if (
    !["matching", "choose", "aligning", "ready", "done", "rendering"].includes(
      job.status,
    )
  )
    return null;
  if (chosen)
    return (
      <section
        className={
          "match-summary " + (job.reference ? "has-reference" : "is-draft")
        }
      >
        <div>
          {job.reference ? <CheckCircle size={21} /> : <Info size={21} />}
          <div>
            <strong>
              {job.reference
                ? "已匹配 · " + job.reference.title
                : "直接识别初稿 · 尚未使用参考曲谱"}
            </strong>
            <p>
              {job.reference
                ? job.reference.version +
                  " · " +
                  job.reference.sourceName +
                  " · 已按实际演奏时间对齐"
                : "识别音符可能有误，请试听并校正。你也可以重新匹配曲目。"}
              {job.reviewCount
                ? ` · ${job.reviewCount} 个参考音符建议试听复核`
                : ""}
              {job.reference?.kind === "melody"
                ? " · 只含主旋律，不含完整伴奏声部"
                : ""}
            </p>
          </div>
        </div>
        <button
          disabled={job.status === "rendering" || !!pending}
          onClick={rematch}
        >
          重新匹配 <ArrowRight size={15} />
        </button>
      </section>
    );
  return (
    <section className="match-panel" aria-label="匹配曲目">
      <div className="match-heading">
        <div className="match-heading-title">
          <span className="step-number">02</span>
          <h2>
            {working
              ? job.status === "aligning"
                ? "正在对齐你的演奏"
                : "正在查找匹配曲目"
              : "这段演奏，来自哪首曲子？"}
          </h2>
        </div>
        <span className="catalog-count">
          {count ? count.toLocaleString() + " 份可用参考谱" : "公开曲谱匹配"}
        </span>
      </div>
      <p className="match-intro">
        系统根据演奏查找候选曲目。确认相同的编配版本后，让曲谱跟随你的速度出现，无需上传曲谱。
      </p>
      {working ? (
        <div className="match-working" role="status">
          <SpinnerGap className="spin" size={24} />
          <div>
            <strong>{job.message}</strong>
            <p>
              {job.status === "aligning"
                ? "正在计算音符与视频时间的对应关系。"
                : "正在比较旋律、和声与演奏片段，尚未确认曲目。"}
            </p>
          </div>
          <span>{job.progress}%</span>
        </div>
      ) : (
        <>
          <form className="score-search" onSubmit={search}>
            <MagnifyingGlass size={18} />
            <input
              aria-label="按曲名或作曲者查找参考谱"
              placeholder="候选不对？输入曲名或作曲者查找"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              maxLength={100}
            />
            <button disabled={searching}>
              {searching ? (
                <SpinnerGap size={17} className="spin" />
              ) : (
                "查找曲目"
              )}
            </button>
          </form>
          {results === null && !job.matching?.credible && (
            <div className="no-match-note">
              <Info size={17} />
              <p>
                暂未找到足够吻合的版本。下方仅是候选，不代表已识别成功；可输入曲名查找其他版本。
              </p>
            </div>
          )}
          {results !== null && (
            <div className="search-result-label">
              <span>
                “{query}” 的曲库搜索结果 · {items.length} 个版本
              </span>
              <button
                onClick={() => {
                  setResults(null);
                  setQuery("");
                }}
              >
                返回自动匹配
              </button>
            </div>
          )}
          <div className="candidate-grid">
            {items.map((item, index) => (
              <article
                className={
                  "candidate " + (item.level === "strong" ? "strong" : "")
                }
                key={item.id}
              >
                <div className="candidate-top">
                  <span>
                    {results === null
                      ? "候选 " + String(index + 1).padStart(2, "0")
                      : "曲库版本"}
                  </span>
                  <span
                    className={"candidate-fit " + (item.level || "unchecked")}
                  >
                    {item.level === "strong"
                      ? "音高较吻合"
                      : item.level === "possible"
                        ? "需确认版本"
                        : item.level === "weak"
                          ? "相似度较低"
                          : "尚未对比录音"}
                  </span>
                </div>
                <h3 title={item.title}>{item.title}</h3>
                <p className="candidate-composer">
                  {item.composer || "作者信息以来源为准"}
                </p>
                <p className="candidate-version">
                  <MusicNotes size={14} />
                  {item.version}
                  {item.shift
                    ? " · 移调 " +
                      (item.shift > 0 ? "+" : "") +
                      item.shift +
                      " 半音"
                    : ""}
                </p>
                <div className="candidate-source">
                  <a
                    href={item.source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.sourceName}
                    <ArrowUpRight size={12} />
                  </a>
                  <span>{item.noteCount} 音符</span>
                </div>
                <div className="candidate-actions">
                  <button
                    className="audition-button"
                    onClick={() => audition(item)}
                    disabled={!!pending}
                  >
                    {playing === item.id ? (
                      <Stop weight="fill" size={13} />
                    ) : (
                      <Play weight="fill" size={13} />
                    )}
                    试听旋律
                  </button>
                  <button
                    className="choose-score"
                    disabled={!!pending || item.level === "weak"}
                    onClick={() => choose(item)}
                  >
                    {pending === item.id ? (
                      <SpinnerGap className="spin" size={15} />
                    ) : (
                      "确认并对齐"
                    )}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </article>
            ))}
          </div>
          {!items.length && (
            <div className="empty-candidates">
              <MusicNotes size={28} />
              <h3>当前曲库还没有找到可用的谱</h3>
              <p>
                试试作品名、作曲者或其他常见名称。库外曲目暂时无法自动套谱。
              </p>
            </div>
          )}
          <div className="match-footnote">
            <p>
              匹配范围为当前已接入的公开曲库；相似度不是识别准确率。社区主旋律谱会单独标注，原谱未记节奏时，时间由演奏估计。
            </p>
            <button
              className="draft-button"
              disabled={!!pending}
              onClick={draft}
            >
              暂用直接识别初稿 <ArrowRight size={14} />
            </button>
          </div>
        </>
      )}
    </section>
  );
}
