export const MAX_DURATION = 60;
export function validateRender(body, duration) {
  if (!body || typeof body !== "object") throw Error("无效的导出设置");
  const { notes } = body;
  if (!Array.isArray(notes) || !notes.length || notes.length > 2500)
    throw Error("音符列表为空或过长");
  const clean = notes
    .map((n, i) => {
      if (
        !n ||
        !Number.isInteger(n.pitch) ||
        n.pitch < 21 ||
        n.pitch > 108 ||
        !Number.isFinite(n.start) ||
        !Number.isFinite(n.end) ||
        n.start < 0 ||
        n.end <= n.start ||
        n.end > duration + 0.02
      )
        throw Error("音符时间或音高无效");
      return {
        id: String(i),
        pitch: n.pitch,
        start: n.start,
        end: n.end,
        confidence: Math.max(0, Math.min(1, Number(n.confidence) || 0)),
      };
    })
    .sort((a, b) => a.start - b.start);
  const offset = Number(body.offset ?? 0);
  if (!Number.isFinite(offset) || Math.abs(offset) > 1)
    throw Error("同步偏移应在 ±1 秒以内");
  return {
    notes: clean,
    title: String(body.title || "我的演奏").slice(0, 50),
    theme: body.theme === "night" ? "night" : "paper",
    labels: body.labels !== false,
    offset,
    duration,
  };
}

export function decodeUploadName(name) {
  if ([...name].some((c) => c.charCodeAt(0) > 255)) return name;
  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return decoded.includes("�") ? name : decoded;
}
