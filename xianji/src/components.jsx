import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useId,
  memo,
} from "react";
import { motion, useReducedMotion, useIsPresent } from "motion/react";
import { X, PencilSimple } from "./icons.jsx";
import { duration, pitches, pitchAt, uid } from "./model.mjs";

import {usePullToDismiss} from "./use-pull-to-dismiss.mjs";
import {InkRenderer} from "./ink-renderer.mjs";

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
function StrokeMark({stroke, opacity=1, nonScaling=false}) {
  if (stroke.points.length === 1) {
    const p=stroke.points[0];
    return <circle cx={p.x*1000} cy={p.y*560} r={stroke.width/2} fill={stroke.color} opacity={opacity} />;
  }
  return <path d={pathData(stroke.points)} fill="none" stroke={stroke.color} strokeWidth={stroke.width}
    opacity={opacity} strokeLinecap="round" strokeLinejoin="round" vectorEffect={nonScaling ? "non-scaling-stroke" : undefined} />;
}
export const Marks = memo(function Marks({ doc, draft = null }) {
  const solo = doc.tracks.some((t) => t.solo),
    id = "pigment-" + useId().replace(/[^a-zA-Z0-9_-]/g, "");
  return (
    <>
      <defs dangerouslySetInnerHTML={{ __html: pigmentFilterMarkup(id) }} />
      <g filter={"url(#" + id + ")"} data-material="dry-pigment">
        {[...doc.strokes, ...(draft ? [draft] : [])].map((s) => {
          const track = doc.tracks.find((t) => t.id === s.track);
          return <StrokeMark key={s.id} stroke={s} nonScaling opacity={track?.muted || (solo && !track?.solo) ? .18 : 1} />;
        })}
      </g>
    </>
  );
});
export const Thumbnail = memo(function Thumbnail({doc}) {
  const ref = useRef(), [visible, setVisible] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) {setVisible(true);observer.disconnect();}
    }, {rootMargin: "120px"});
    observer.observe(ref.current);return () => observer.disconnect();
  }, []);
  const solo = doc.tracks.some(t => t.solo);
  return <svg ref={ref} viewBox="0 0 1000 560" aria-hidden="true">
    {visible && doc.strokes.map(s => {
      const t = doc.tracks.find(t => t.id === s.track);
      return <StrokeMark key={s.id} stroke={s} opacity={t?.muted || (solo && !t?.solo) ? .18 : 1} />;
    })}
  </svg>;
});

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
// A modeless inspector: the canvas and keyboard stay available beside it.
export function DockPanel({ title, subtitle, close, children }) {
  const reduce = useReducedMotion();
  return <motion.aside className="dock-panel" aria-label={title}
    initial={{ opacity: 0, x: reduce ? 0 : 20 }} animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: reduce ? 0 : 16 }}
    transition={{ duration: reduce ? .1 : .24, ease: [.22, 1, .36, 1] }}>
    <header className="modal-header"><div><h1>{title}</h1>{subtitle && <p>{subtitle}</p>}</div>
      <IconButton label="关闭" onClick={close}><X /></IconButton></header>
    <div className="modal-content">{children}</div>
  </motion.aside>;
}
// An anchored file menu leaves the canvas visible and has no blocking backdrop.
export function FileMenu({children,close,returnFocus}) {
  const ref=useRef(), closeRef=useRef(close), reduce=useReducedMotion(), present=useIsPresent(), presentRef=useRef(present);
  closeRef.current=close;presentRef.current=present;
  useEffect(() => {
    const node=ref.current;
    const pointer=event => {
      if(!presentRef.current)return;
      if(node.contains(event.target) || event.target.closest(".canvas-menu"))return;
      closeRef.current();
      if(event.target.closest(".music-canvas")){event.preventDefault();event.stopPropagation();}
    };
    const key=event => {
      if(!presentRef.current)return;
      if(event.key==="Escape"){event.preventDefault();event.stopPropagation();closeRef.current();returnFocus.current?.focus();}
      if(event.key==="Tab" && node.contains(document.activeElement)) {
        const items=[...node.querySelectorAll("button,input")], first=items[0], last=items.at(-1);
        if(event.shiftKey && document.activeElement===first){event.preventDefault();last.focus();}
        else if(!event.shiftKey && document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    node.querySelector("button")?.focus({preventScroll:true});
    document.addEventListener("pointerdown",pointer,true);document.addEventListener("keydown",key);
    return () => {document.removeEventListener("pointerdown",pointer,true);document.removeEventListener("keydown",key);};
  },[returnFocus]);
  return <motion.div ref={ref} className="file-menu glass" role={present ? "dialog" : undefined} aria-hidden={!present || undefined} inert={!present || undefined} aria-label="画布与文件"
    initial={{opacity:0,y:reduce?0:-6,scale:reduce?1:.98}} animate={{opacity:1,y:0,scale:1}}
    exit={{opacity:0,y:reduce?0:-4,scale:reduce?1:.98}} transition={{duration:reduce?.1:.18,ease:[.22,1,.36,1]}}>{children}</motion.div>;
}
export function Modal({
  title,
  subtitle,
  close,
  children,
  wide = false,
  returnFocus,
  dismissible = true,
}) {
  const ref = useRef(),
    closeRef = useRef(close),
    reduce = useReducedMotion();
  closeRef.current = close;
  usePullToDismiss(ref, closeRef, dismissible, reduce);
  useEffect(() => {const content = ref.current?.querySelector(".modal-content");if (content) content.scrollTop = 0;}, [title]);
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

        }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{
          opacity: 0,
          y: reduce ? 0 : 14,
          scale: reduce ? 1 : 0.975,

          transition: { duration: 0.17, ease: [0.22, 1, 0.36, 1] },
        }}
        transition={{
          type: "spring",
          bounce: 0.03,
          duration: reduce ? 0.12 : 0.32,
        }}
      >
        <header className="modal-header">
          <span className="modal-grab-handle" aria-hidden="true" />
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

export function ScoreCanvas({doc, track, instrument, color, width, tool, onStroke, onErase,
  playing, visualActive = true, onLimit, player, onInteract}) {
  const base = useRef(), live = useRef(), highlight = useRef(), head = useRef();
  const renderer = useRef(), current = useRef(), draftRef = useRef(null);
  const gesture = useRef(null), inputFrame = useRef(0), lastPreview = useRef(0);
  const [drawing, setDrawing] = useState(false);
  current.current = {doc, track, instrument, color, width, tool, onStroke, onErase, onLimit, onInteract};
  const pointCount = useMemo(() => doc.strokes.reduce((n, s) => n + s.points.length, 0), [doc.strokes]);
  useLayoutEffect(() => {
    const ink = new InkRenderer(base.current, live.current, highlight.current);
    renderer.current = ink; ink.setDoc(current.current.doc);
    const resize = () => {const r = base.current.getBoundingClientRect();ink.resize(r.width, r.height, window.devicePixelRatio || 1);if (draftRef.current && !draftRef.current.erase) ink.drawLive(draftRef.current);};
    resize();
    const observer = new ResizeObserver(resize); observer.observe(base.current);
    return () => {observer.disconnect();cancelAnimationFrame(inputFrame.current);player.liveStroke = null;ink.destroy();};
  }, [player]);
  useLayoutEffect(() => {
    renderer.current?.setDoc(doc);
    if (!draftRef.current) renderer.current?.clearLive();
  }, [doc]);
  useEffect(() => {
    let frame;
    function scan() {
      const phase = player.position() / duration(current.current.doc), ink = renderer.current;
      if (ink) {
        head.current.style.transform = `translate3d(${phase * ink.width}px,0,0)`;
        ink.scan(phase, playing && visualActive);
      }
      if (playing && visualActive) frame = requestAnimationFrame(scan);
    }
    scan();
    return () => cancelAnimationFrame(frame);
  }, [playing, visualActive, player, doc.bpm, doc.bars]);
  const point = e => {
    const r = gesture.current.rect;
    return {x: Math.max(0, Math.min(.99999, (e.clientX - r.left) / r.width)),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))};
  };
  function preview(p) {
    if (performance.now() - lastPreview.current < 125) return;
    lastPreview.current = performance.now();
    player.preview({midi: pitchAt(p.y, doc), instrument, volume: track.volume}).catch(() => {});
  }
  function flushInput() {
    inputFrame.current = 0;
    const stroke = draftRef.current;
    if (stroke && !stroke.erase) {renderer.current?.drawLive(stroke);preview(stroke.points.at(-1));}
  }
  function down(e) {
    if (e.button !== 0 || gesture.current) return;
    e.preventDefault();onInteract();
    if (tool !== "erase" && (doc.strokes.length >= 500 || pointCount >= 99999)) {onLimit();return;}
    gesture.current = {id: e.pointerId, rect: base.current.getBoundingClientRect()};
    base.current.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === "erase") {draftRef.current = {erase: true};onErase(p, gesture.current.rect);return;}
    gesture.current.start = p;gesture.current.threshold = e.pointerType === "touch" ? 6 : 3;
    gesture.current.line = false;
    const stroke = {id: uid(), track: track.id, instrument, color, width: 9, points: [p]};
    draftRef.current = stroke;player.liveStroke = stroke;setDrawing(true);
    renderer.current?.drawLive(stroke);preview(p);
  }
  function move(e) {
    if (!draftRef.current || e.pointerId !== gesture.current?.id) return;
    if (draftRef.current.erase) {onErase(point(e), gesture.current.rect);return;}
    const stroke = draftRef.current;
    const coalesced = e.nativeEvent.getCoalescedEvents?.();
    let changed = false;
    for (const event of coalesced?.length ? coalesced : [e]) {
      const p = point(event), a = stroke.points.at(-1), g = gesture.current;
      let startedLine = false;
      if (!g.line) {
        if (Math.hypot((p.x-g.start.x)*g.rect.width,(p.y-g.start.y)*g.rect.height) < g.threshold) continue;
        g.line = true;startedLine = true;stroke.width = width;
        renderer.current?.clearLive();
      }
      if (!startedLine && Math.hypot(p.x - a.x, p.y - a.y) < .0015) continue;
      if (stroke.points.length >= Math.min(2500, 100000 - pointCount)) break;
      stroke.points.push(p);changed = true;
    }
    if (changed && !inputFrame.current) inputFrame.current = requestAnimationFrame(flushInput);
  }

  function end(e) {
    if (e.pointerId !== gesture.current?.id) return;
    if (e.type === "pointerup" && draftRef.current && !draftRef.current.erase) move(e);
    cancelAnimationFrame(inputFrame.current);inputFrame.current = 0;
    const stroke = draftRef.current;
    if (stroke && !stroke.erase) {
      onStroke(stroke);
    }
    draftRef.current = null;player.liveStroke = null;gesture.current = null;
    renderer.current?.clearLive();setDrawing(false);
    if (base.current.hasPointerCapture(e.pointerId)) base.current.releasePointerCapture(e.pointerId);
  }
  return <section className={"canvas-stage " + (tool === "erase" ? "erasing" : "")} aria-label="沉浸画布">
    <canvas ref={base} className="music-canvas" role="application"
      data-stroke-count={doc.strokes.length + (drawing ? 1 : 0)}
      aria-label="音乐画布，点按画圆点，拖动画线，高处音高低处音低"
      onPointerDown={down} onPointerMove={move} onPointerUp={end} onPointerCancel={end} />
    <canvas ref={live} className="live-ink" aria-hidden="true" />
    <canvas ref={highlight} className="playback-ink" aria-hidden="true" />
    <div ref={head} className="playhead" aria-hidden="true" hidden={!playing && player.position() === 0} />
    {!doc.strokes.length && !drawing && <div className="canvas-empty"><PencilSimple size={26} weight="light" /><p>点一下，或画一笔。</p><span>点出单音，画出旋律。</span></div>}
  </section>;
}
