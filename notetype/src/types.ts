export type Note = {
  id: string;
  pitch: number;
  start: number;
  end: number;
  confidence: number;
  durationBeats?: number;
  sourceBeat?: number;
  measure?: string;
  review?: boolean;
};
export type MatchCandidate = {
  id: string;
  title: string;
  composer: string;
  version: string;
  source: string;
  sourceName: string;
  noteCount: number;
  kind?: "score" | "melody";
  similarity?: number;
  shift?: number;
  startBeat?: number;
  endBeat?: number;
  level?: "strong" | "possible" | "weak";
};
export type FilmProps = {
  src: string;
  notes: Note[];
  title: string;
  duration: number;
  offset: number;
  theme: "paper" | "night";
  labels: boolean;
  demo?: boolean;
  fontSrc?: string;
};
export type Job = {
  id: string;
  status:
    | "queued"
    | "extracting"
    | "transcribing"
    | "matching"
    | "choose"
    | "aligning"
    | "ready"
    | "rendering"
    | "done"
    | "error";
  progress: number;
  message: string;
  duration: number;
  src: string;
  notes: Note[];
  download?: string;
  error?: string;
  name: string;
  matching?: {
    candidates: MatchCandidate[];
    coverage: number;
    credible: boolean;
    message?: string;
  };
  reference?: MatchCandidate;
  reviewCount?: number;
  matchDecision?: "reference" | "draft";
};
