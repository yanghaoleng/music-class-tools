import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useId,
  memo,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import { X, PencilSimple } from "@phosphor-icons/react";
import { duration, notesAt, pitches, pitchAt, uid } from "./model.mjs";

export const pathData = (points) =>
  points.length === 1
    ? `M${points[0].x * 1000},${points[0].y * 560}l.1,.1`
    : points
        .map(
          (p, i) =>
            `${i ? "L" : "M"}${(p.x * 1000).toFixed(2)},${(p.y * 560).toFixed(2)}`,
        )
        .join(" ");
export const pigmentFilterMarkup = (id) =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" x="-15" y="-15" width="1030" height="590" color-interpolation-filters="sRGB"><feTurbulence type="fractalNoise" baseFrequency=".72 .94" numOctaves="3" seed="18" result="grain"/><feColorMatrix in="grain" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1.4 0 0 0 -.1" result="grit"/><feComponentTransfer in="grit" result="dry"><feFuncA type="discrete" tableValues="0 .18 .5 .82 1 1"/></feComponentTransfer><feComposite in="SourceGraphic" in2="dry" operator="in" result="pigment"/><feDisplacementMap in="pigment" in2="grain" scale="1.25" xChannelSelector="R" yChannelSelector="G"/></filter>`;
export const Marks = memo(function Marks({ doc, draft = null }) {
  const solo = doc.tracks.some((t) => t.solo),
    id = "pigment-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <>
      <defs dangerouslySetInnerHTML={{ __html: pigmentFilterMarkup(id) }} />
      <g filter={"url(#" + id + ")"} data-material="dry-pigment">
        {[...doc.strokes, ...(draft ? [draft] : [])].map((s) => {
          const track = doc.tracks.find((t) => t.id === s.track);
          return (
            <path
              key={s.id}
              d={pathData(s.points)}
              fill="none"
              stroke={s.color}
              strokeWidth={s.width}
              opacity={track?.muted || (solo && !track?.solo) ? 0.18 : 1}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
            />
          );
        })}
      </g>
    </>
  );
});
export function Thumbnail({ doc }) {
  return (
    <svg viewBox="0 0 1000 560" aria-hidden="true">
      <Marks doc={doc} />
    </svg>
  );
}
export function IconButton({ label, children, ...props }) {
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
export function TempoInput({ value, onChange }) {
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
export function Modal({
  title,
  subtitle,
  close,
  children,
  wide = false,
  returnFocus,
}) {
  const ref = useRef(),
    closeRef = useRef(close),
    reduce = useReducedMotion();
  closeRef.current = close;
  useEffect(() => {
    const previous = returnFocus?.current || document.activeElement;
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
        } else if (
          !e.shiftKey &&
          (document.activeElement === items.at(-1) ||
            document.activeElement === ref.current)
        ) {
          e.preventDefault();
          items[0].focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <motion.div
      className="overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0.1 : 0.2 }}
      onClick={(e) => e.target === e.currentTarget && close()}
    >
      <motion.section
        ref={ref}
        className={"glass-modal " + (wide ? "wide" : "")}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        initial={{
          opacity: 0,
          y: reduce ? 0 : 22,
          scale: reduce ? 1 : 0.965,
          filter: reduce ? "none" : "blur(5px)",
        }}
        animate={{ opacity: 1, y: 0, scale: 1, filter: "blur(0px)" }}
        exit={{
          opacity: 0,
          y: reduce ? 0 : 14,
          scale: reduce ? 1 : 0.975,
          filter: reduce ? "none" : "blur(4px)",
          transition: { duration: 0.17, ease: [0.22, 1, 0.36, 1] },
        }}
        transition={{
          type: "spring",
          bounce: 0.03,
          duration: reduce ? 0.12 : 0.32,
        }}
      >
        <header className="modal-header">
          <div>
            <h1>{title}</h1>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <IconButton label="关闭" onClick={close}>
            <X />
          </IconButton>
        </header>
        <div className="modal-content">{children}</div>
      </motion.section>
    </motion.div>
  );
}

export function ScoreCanvas({
  doc,
  track,
  color,
  width,
  tool,
  onStroke,
  onErase,
  playing,
  onLimit,
  player,
  onInteract,
}) {
  const pointCount = useMemo(
    () => doc.strokes.reduce((n, s) => n + s.points.length, 0),
    [doc.strokes],
  );
  const svg = useRef(),
    draftRef = useRef(),
    lastPreview = useRef(0),
    activePointer = useRef(null);
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
  }, [doc.bpm, doc.bars, playing, player]);
  useEffect(
    () => () => {
      player.liveStroke = null;
    },
    [player],
  );
  const point = (e) => {
    const r = svg.current.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(0.99999, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    };
  };
  function preview(p) {
    if (performance.now() - lastPreview.current < 125) return;
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
    if (e.button !== 0 || activePointer.current !== null) return;
    e.preventDefault();
    onInteract();
    activePointer.current = e.pointerId;
    svg.current.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === "erase") {
      draftRef.current = { erase: true };
      onErase(p, svg.current.getBoundingClientRect());
      return;
    }
    if (doc.strokes.length >= 500 || pointCount >= 99999) {
      onLimit();
      return;
    }
    const s = { id: uid(), track: track.id, color, width, points: [p] };
    draftRef.current = s;
    player.liveStroke = s;
    setDraft(s);
    preview(p);
  }
  function move(e) {
    if (!draftRef.current || e.pointerId !== activePointer.current) return;
    if (draftRef.current.erase) {
      onErase(point(e), svg.current.getBoundingClientRect());
      return;
    }
    let d = draftRef.current;
    const coalesced = e.nativeEvent.getCoalescedEvents?.();
    const events = coalesced?.length ? coalesced : [e];
    for (const event of events) {
      const p = point(event),
        a = d.points.at(-1);
      if (Math.hypot(p.x - a.x, p.y - a.y) < 0.0015) continue;
      if (d.points.length >= Math.min(2500, 100000 - pointCount)) break;
      d = { ...d, points: [...d.points, p] };
    }
    draftRef.current = d;
    player.liveStroke = d;
    setDraft(d);
    preview(d.points.at(-1));
  }
  function end(e) {
    if (e.pointerId !== activePointer.current) return;
    if (draftRef.current && !draftRef.current.erase) {
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
    player.liveStroke = null;
    activePointer.current = null;
    setDraft(null);
    if (svg.current.hasPointerCapture(e.pointerId))
      svg.current.releasePointerCapture(e.pointerId);
  }
  const score = draft ? { ...doc, strokes: [...doc.strokes, draft] } : doc;
  const playbackId = "playback-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const highlightWidth = (24 * 1000) / (svg.current?.clientWidth || 1000);
  const active = playing
    ? notesAt(score, Math.floor(phase * doc.bars * 4 * doc.division))
    : [];
  return (
    <section
      className={"canvas-stage " + (tool === "erase" ? "erasing" : "")}
      aria-label="沉浸画布"
    >
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
        onPointerCancel={end}
      >
        <Marks doc={doc} draft={draft} />
        {(playing || phase > 0) && (
          <g className="playhead" pointerEvents="none">
            <rect
              x={phase * 1000 - 9}
              y="0"
              width="18"
              height="560"
              fill="#888888"
              opacity=".035"
            />
            <line
              x1={phase * 1000}
              x2={phase * 1000}
              y1="0"
              y2="560"
              stroke="#8b8985"
              strokeOpacity=".38"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
            <defs>
              <clipPath
                id={playbackId + "-clip"}
                clipPathUnits="userSpaceOnUse"
              >
                <rect
                  x={phase * 1000 - highlightWidth / 2}
                  y="-15"
                  width={highlightWidth}
                  height="590"
                />
              </clipPath>
            </defs>
            <defs
              dangerouslySetInnerHTML={{
                __html: pigmentFilterMarkup(playbackId + "-ink"),
              }}
            />
            <g
              className="playback-ink"
              clipPath={"url(#" + playbackId + "-clip)"}
            >
              <g filter={"url(#" + playbackId + "-ink)"}>
                {score.strokes
                  .filter((s) => active.some((n) => n.stroke === s.id))
                  .map((s) => (
                    <path
                      key={s.id}
                      d={pathData(s.points)}
                      fill="none"
                      stroke={
                        "#" +
                        s.color
                          .slice(1)
                          .match(/.{2}/g)
                          .map((c) =>
                            Math.round(parseInt(c, 16) * 0.64)
                              .toString(16)
                              .padStart(2, "0"),
                          )
                          .join("")
                      }
                      strokeWidth={s.width}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      vectorEffect="non-scaling-stroke"
                    />
                  ))}
              </g>
            </g>
          </g>
        )}
      </svg>
      {!doc.strokes.length && !draft && (
        <div className="canvas-empty">
          <PencilSimple size={26} weight="light" />
          <p>画一笔，听见它。</p>
          <span>越高的线，越高的音。</span>
        </div>
      )}
    </section>
  );
}
