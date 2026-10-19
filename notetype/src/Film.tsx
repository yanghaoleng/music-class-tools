import React, { useEffect, useState, useId } from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  Video,
  useCurrentFrame,
  useVideoConfig,
  getRemotionEnvironment,
  delayRender,
  continueRender,
  cancelRender,
} from "remotion";
import type { FilmProps, Note } from "./types";
const names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
export const pitchName = (p: number) =>
  names[((p % 12) + 12) % 12] + (Math.floor(p / 12) - 1);
const diatonic = (p: number) =>
  Math.floor(p / 12) * 7 + [0, 0, 1, 1, 2, 3, 3, 4, 4, 5, 5, 6][p % 12];
function StaffNote({
  note,
  x,
  y,
  active,
  ink,
  accent,
  labels,
  glowId,
}: {
  note: Note;
  x: number;
  y: number;
  active: boolean;
  ink: string;
  accent: string;
  labels: boolean;
  glowId: string;
}) {
  const color = active ? accent : ink;
  const bass = note.pitch < 60;
  const bottom = bass ? 318 : 158;
  const top = bottom - 48;
  const up = y > top + 24;
  const stemX = x + (up ? 9 : -9);
  const dur = note.end - note.start;
  const ledger = [];
  for (let ly = bottom + 12; ly <= y + 1; ly += 12) ledger.push(ly);
  for (let ly = top - 12; ly >= y - 1; ly -= 12) ledger.push(ly);
  return (
    <g
      filter={active ? `url(#${glowId})` : undefined}
      opacity={active ? 1 : 0.84}
    >
      {active && <circle cx={x} cy={y} r={21} fill={accent} opacity={0.16} />}
      {ledger.map((ly) => (
        <line
          key={ly}
          x1={x - 16}
          x2={x + 16}
          y1={ly}
          y2={ly}
          stroke={color}
          strokeWidth={2}
        />
      ))}
      {[1, 3, 6, 8, 10].includes(note.pitch % 12) && (
        <text x={x - 26} y={y + 6} fill={color} fontSize={24}>
          ♯
        </text>
      )}
      <ellipse
        cx={x}
        cy={y}
        rx={10}
        ry={7}
        transform={`rotate(-18 ${x} ${y})`}
        fill={dur > 1 ? "none" : color}
        stroke={color}
        strokeWidth={2.5}
      />
      {dur < 2 && (
        <line
          x1={stemX}
          x2={stemX}
          y1={y}
          y2={y + (up ? -43 : 43)}
          stroke={color}
          strokeWidth={2.5}
        />
      )}{" "}
      {dur < 0.32 && (
        <path
          d={
            up
              ? `M${stemX},${y - 43} q24,10 10,30`
              : `M${stemX},${y + 43} q-24,-10 -10,-30`
          }
          stroke={color}
          strokeWidth={3}
          fill="none"
        />
      )}
      {labels && (
        <text
          x={x}
          y={bass ? 375 : 215}
          textAnchor="middle"
          fontSize={13}
          fill={active ? accent : ink}
          opacity={active ? 1 : 0.65}
        >
          {pitchName(note.pitch)}
        </text>
      )}
    </g>
  );
}
export function Score({
  notes,
  time,
  theme = "paper",
  labels = true,
  offset = 0,
}: {
  notes: Note[];
  time: number;
  theme?: "paper" | "night";
  labels?: boolean;
  offset?: number;
}) {
  const glowId = "note-glow-" + useId().replace(/:/g, "");
  const ink = "#fff";
  const accent = theme === "paper" ? "#fff4d2" : "#a6ffe3";
  const at = time - offset;
  const page = Math.max(0, Math.floor(at / 4));
  const start = page * 4;
  // Keep the whole phrase visible. Playback only changes emphasis, never note position.
  const shown = notes.filter((n) => n.end > start && n.start < start + 4);
  return (
    <svg
      viewBox="0 0 960 460"
      style={{ width: "100%", height: "100%", display: "block" }}
      aria-label="固定谱位、当前演奏音符发光的高低音双谱表"
    >
      <defs>
        <filter
          id={glowId}
          x="-200%"
          y="-200%"
          width="500%"
          height="500%"
          colorInterpolationFilters="sRGB"
        >
          <feGaussianBlur in="SourceGraphic" stdDeviation="5" result="halo" />
          <feMerge>
            <feMergeNode in="halo" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <text
        x="910"
        y="42"
        fill={ink}
        opacity=".55"
        textAnchor="end"
        fontSize="13"
        letterSpacing="2"
      >
        {String(start).padStart(2, "0")} — {String(start + 4).padStart(2, "0")}{" "}
        s
      </text>
      {[0, 1].map((s) => (
        <g key={s}>
          {[0, 1, 2, 3, 4].map((l) => (
            <line
              key={l}
              x1="50"
              x2="910"
              y1={110 + s * 160 + l * 12}
              y2={110 + s * 160 + l * 12}
              stroke={ink}
              strokeWidth="1"
              opacity=".48"
            />
          ))}
          <text
            x={60}
            y={s ? 316 : 166}
            fill={ink}
            fontSize={s ? 64 : 83}
            fontFamily="NoteTypeMusic"
          >
            {s ? "𝄢" : "𝄞"}
          </text>
        </g>
      ))}
      <line x1="50" x2="50" y1="110" y2="318" stroke={ink} opacity=".6" />
      <line x1="910" x2="910" y1="110" y2="318" stroke={ink} opacity=".6" />
      {shown.map((n) => {
        const bass = n.pitch < 60;
        const ref = bass ? diatonic(43) : diatonic(64);
        const y = (bass ? 318 : 158) - (diatonic(n.pitch) - ref) * 6;
        return (
          <StaffNote
            key={n.id}
            note={n}
            x={155 + (Math.max(0, n.start - start) / 4) * 710}
            y={y}
            active={at >= n.start && at < n.end}
            ink={ink}
            accent={accent}
            labels={labels}
            glowId={glowId}
          />
        );
      })}
      {at >= 0 && (
        <line
          x1={155 + Math.min(1, (at - start) / 4) * 710}
          x2={155 + Math.min(1, (at - start) / 4) * 710}
          y1="70"
          y2="350"
          stroke={accent}
          strokeWidth="1"
          opacity=".32"
        />
      )}
    </svg>
  );
}
export function Film(props: FilmProps) {
  const [fontHandle] = useState(() =>
    delayRender("Loading music notation font"),
  );
  useEffect(() => {
    const font = new FontFace(
      "NoteTypeMusic",
      `url(${props.fontSrc || "/notetype/music.ttf"})`,
    );
    let active = true;
    font
      .load()
      .then((loaded) => {
        document.fonts.add(loaded);
        if (active) continueRender(fontHandle);
      })
      .catch(cancelRender);
    return () => {
      active = false;
    };
  }, [fontHandle, props.fontSrc]);
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const V = getRemotionEnvironment().isRendering ? OffthreadVideo : Video;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: "#151b19",
        color: "white",
        fontFamily: "Arial, sans-serif",
        overflow: "hidden",
      }}
    >
      <AbsoluteFill style={{ overflow: "hidden" }}>
        <V
          src={props.src}
          muted
          volume={0}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            filter: "blur(38px) brightness(0.62) saturate(0.72)",
            transform: "scale(1.16)",
          }}
        />
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg,rgba(0,0,0,.06),rgba(0,0,0,.08) 40%,rgba(0,0,0,.38) 70%)",
        }}
      />
      <div
        style={{
          position: "absolute",
          top: 105,
          left: 55,
          right: 55,
          textAlign: "center",
          textShadow: "0 2px 18px rgba(0,0,0,.25)",
        }}
      >
        <div
          style={{
            fontSize: 16,
            letterSpacing: 5,
            opacity: 0.7,
            marginBottom: 23,
          }}
        >
          {props.demo ? "SYNTHESIZED PERFORMANCE" : "PERFORMANCE SCORE"}
        </div>
        <div
          style={{
            fontSize: props.title.length > 16 ? 42 : 58,
            fontWeight: 600,
            lineHeight: 1.3,
            overflowWrap: "anywhere",
          }}
        >
          {props.title || "我的演奏"}
        </div>
        <div
          style={{
            width: 38,
            height: 1,
            background: "rgba(255,255,255,.45)",
            margin: "25px auto 0",
          }}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 330,
          left: 0,
          right: 0,
          height: 460,
        }}
      >
        <Score
          notes={props.notes}
          time={time}
          offset={props.offset}
          theme={props.theme}
          labels={props.labels}
        />
      </div>
      <div
        style={{
          position: "absolute",
          top: 820,
          bottom: 0,
          left: 0,
          right: 0,
          background: "#111714",
          borderTop: "1px solid rgba(255,255,255,.12)",
        }}
      >
        <V
          src={props.src}
          style={{ width: "100%", height: "100%", objectFit: "contain" }}
        />
      </div>
    </AbsoluteFill>
  );
}
