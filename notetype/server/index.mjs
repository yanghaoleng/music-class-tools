import express from "express";
import multer from "multer";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  mkdir,
  readFile,
  writeFile,
  rename,
  rm,
  readdir,
  stat,
  copyFile,
} from "node:fs/promises";
import { execFile, fork } from "node:child_process";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { featuresFromNotes } from "./matching.mjs";
import {
  validateRender,
  MAX_DURATION,
  decodeUploadName,
} from "./validation.mjs";
const exec = promisify(execFile),
  root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
  data = path.resolve(process.env.DATA_DIR || path.join(root, "data")),
  port = Number(process.env.PORT || 8795),
  base = "/notetype";
const catalogDir = path.join(root, "catalog");
let catalogPromise;
function catalog() {
  return (catalogPromise ||= readFile(
    path.join(catalogDir, "index.json"),
    "utf8",
  )
    .then(JSON.parse)
    .catch((e) => {
      catalogPromise = undefined;
      throw e;
    }));
}
function scoreMeta(item) {
  const { hist, grams, ...metadata } = item;
  return metadata;
}
await mkdir(path.join(data, "uploads"), { recursive: true });
const app = express();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use((req, res, next) => {
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Referrer-Policy", "same-origin");
  if (req.path === base + "/music.ttf")
    res.set("Access-Control-Allow-Origin", "*");
  if (req.path.startsWith(base + "/api")) res.set("Cache-Control", "no-store");
  if (req.method === "POST" && req.get("origin")) {
    let origin;
    try {
      origin = new URL(req.get("origin"));
    } catch {
      return res.status(403).json({ error: "来源无效" });
    }
    if (!["m.mikeywa.site", "127.0.0.1", "localhost"].includes(origin.hostname))
      return res.status(403).json({ error: "请从 NoteType 页面发起请求" });
  }
  next();
});
app.use(express.json({ limit: "500kb" }));
const rate = new Map();
app.use(base + "/api", (req, res, next) => {
  if (req.method !== "POST") return next();
  const now = Date.now(),
    key = req.ip,
    entry = rate.get(key) || { count: 0, until: now + 3600000 };
  if (now > entry.until) {
    entry.count = 0;
    entry.until = now + 3600000;
  }
  entry.count++;
  rate.set(key, entry);
  if (entry.count > 20)
    return res.status(429).json({ error: "操作较频繁，请稍后再试" });
  next();
});
setInterval(() => {
  for (const [key, value] of rate)
    if (Date.now() > value.until) rate.delete(key);
}, 3600000).unref();
const jobs = new Map(),
  queue = [];
let working = false;
const MAX_QUEUE = 4,
  TTL = 6 * 3600 * 1000;
function publicJob(job) {
  const { createdAt, ...result } = job;
  return result;
}
async function save(job) {
  const dir = path.join(data, job.id);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "job.json.tmp"), JSON.stringify(job));
  await rename(path.join(dir, "job.json.tmp"), path.join(dir, "job.json"));
}
async function update(job, props) {
  Object.assign(job, props);
  await save(job);
}
async function getJob(id) {
  if (!/^[a-f0-9-]{36}$/.test(id)) return null;
  let j = jobs.get(id);
  if (!j) {
    try {
      j = JSON.parse(await readFile(path.join(data, id, "job.json"), "utf8"));
      jobs.set(id, j);
    } catch {
      return null;
    }
  }
  if (Date.now() - j.createdAt > TTL) return null;
  return j;
}
async function enqueue(task) {
  queue.push(task);
  drain();
}
async function drain() {
  if (working) return;
  working = true;
  while (queue.length) {
    const task = queue.shift();
    try {
      await task();
    } catch (e) {
      console.error("queue", e);
    }
  }
  working = false;
}
function hasRoom() {
  return queue.length < MAX_QUEUE;
}
const upload = multer({
  dest: path.join(data, "uploads"),
  limits: { fileSize: 80 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    cb(null, /\.(mp4|mov|webm|m4v)$/i.test(file.originalname)),
});
async function probe(file) {
  const { stdout } = await exec(
    "ffprobe",
    [
      "-v",
      "error",
      "-protocol_whitelist",
      "file,pipe",
      "-show_format",
      "-show_streams",
      "-of",
      "json",
      file,
    ],
    { timeout: 15000, maxBuffer: 2 * 1024 * 1024 },
  );
  const info = JSON.parse(stdout),
    video = info.streams.find((s) => s.codec_type === "video"),
    audio = info.streams.find((s) => s.codec_type === "audio");
  const duration = Number(info.format.duration);
  if (
    !["mov,mp4,m4a,3gp,3g2,mj2", "matroska,webm"].includes(
      info.format.format_name,
    )
  )
    throw Error("请上传有效的 MP4、MOV 或 WebM 视频");
  if (!video) throw Error("没有检测到视频画面，请上传演奏视频");
  if (!audio) throw Error("视频没有音轨，请上传带演奏声音的视频");
  if (
    !Number.isFinite(duration) ||
    duration < 0.3 ||
    duration > MAX_DURATION + 0.05
  )
    throw Error("请上传 0.3 至 60 秒的演奏视频");
  return duration;
}
function infer(file, job) {
  return new Promise((resolve, reject) => {
    const child = fork(path.join(root, "server/transcribe.mjs"), [file], {
      stdio: ["ignore", "ignore", "pipe", "ipc"],
      env: { ...process.env, OMP_NUM_THREADS: "1" },
    });
    let result,
      err = "";
    child.stderr.on("data", (b) => {
      err += b;
    });
    child.on("message", (m) => {
      if (m.notes) result = { notes: m.notes, features: m.features };
      else if (m.progress !== undefined) {
        job.progress = 25 + Math.round(m.progress * 0.65);
      }
    });
    const timer = setTimeout(
      () => {
        child.kill("SIGKILL");
        reject(Error("识别耗时过长，请尝试更短、更清晰的片段"));
      },
      15 * 60 * 1000,
    );
    child.on("error", reject);
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 && result) resolve(result);
      else {
        console.error("Inference failed:", err.slice(-4000));
        reject(Error("音符识别未完成，请尝试更短或更清晰的视频"));
      }
    });
  });
}
function matchAnalysis(job, mode = "search", scoreId = "") {
  return new Promise((resolve, reject) => {
    const child = fork(
      path.join(root, "server/match-worker.mjs"),
      [path.join(data, job.id, "analysis.json"), catalogDir, mode, scoreId],
      { stdio: ["ignore", "ignore", "pipe", "ipc"] },
    );
    let result,
      message = "";
    child.stderr.on("data", () => {});
    child.on("message", (m) => {
      if (m.result) result = m.result;
      if (m.error) message = m.error;
      if (m.progress !== undefined)
        job.progress =
          mode === "search"
            ? 90 + Math.round(m.progress * 0.1)
            : Math.round(m.progress);
    });
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(Error("曲谱匹配耗时较长，请重试或缩短演奏片段"));
    }, 180000);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      if (code === 0 && result) resolve(result);
      else reject(Error(message || "曲谱匹配暂未完成，请重试"));
    });
  });
}
async function findMatches(job) {
  await update(job, {
    status: "matching",
    progress: 90,
    message: "正在比对公开曲谱，查找曲目与版本",
    error: undefined,
  });
  try {
    const matching = await matchAnalysis(job);
    await update(job, {
      status: "choose",
      progress: 100,
      matching,
      message: matching.credible
        ? "请选择与你演奏一致的曲目和版本"
        : "暂未找到可信曲谱，可按曲名搜索或保留识别初稿",
    });
  } catch (e) {
    console.error("Score search:", e.message);
    await update(job, {
      status: "choose",
      progress: 100,
      matching: {
        candidates: [],
        coverage: 0,
        credible: false,
        message: e.message,
      },
      message: "曲谱检索暂不可用，可重试或保留识别初稿",
      error: e.message,
    });
  }
}
async function processVideo(job, input) {
  const dir = path.join(data, job.id);
  try {
    await update(job, {
      status: "extracting",
      progress: 5,
      message: "正在提取演奏音轨",
    });
    const duration = await probe(input);
    job.duration = duration;
    await exec(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-protocol_whitelist",
        "file,pipe",
        "-i",
        input,
        "-map",
        "0:v:0",
        "-map",
        "0:a:0",
        "-vf",
        "scale=960:620:force_original_aspect_ratio=decrease:force_divisible_by=2,setsar=1",
        "-r",
        "30",
        "-c:v",
        "libx264",
        "-preset",
        "veryfast",
        "-crf",
        "22",
        "-threads",
        "1",
        "-c:a",
        "aac",
        "-b:a",
        "160k",
        "-movflags",
        "+faststart",
        path.join(dir, "input.mp4"),
      ],
      { timeout: 180000 },
    );
    await rm(input, { force: true });
    await exec(
      "ffmpeg",
      [
        "-v",
        "error",
        "-y",
        "-i",
        path.join(dir, "input.mp4"),
        "-vn",
        "-ac",
        "1",
        "-ar",
        "22050",
        "-f",
        "f32le",
        path.join(dir, "audio.f32"),
      ],
      { timeout: 30000 },
    );
    await update(job, {
      status: "transcribing",
      progress: 25,
      message: "正在识别音高与音符时间",
    });
    const raw = await infer(path.join(dir, "audio.f32"), job);
    const notes = raw.notes
      .map((n) => ({
        ...n,
        start: Math.round(n.start * 1000) / 1000,
        end: Math.round(Math.min(duration, n.end) * 1000) / 1000,
      }))
      .filter((n) => n.start < duration && n.end > n.start);
    if (!notes.length)
      throw Error("未检测到清晰音符。请尝试独奏、减少背景噪声并靠近乐器录制");
    await rm(path.join(dir, "audio.f32"), { force: true });
    await writeFile(
      path.join(dir, "analysis.json"),
      JSON.stringify({
        notes,
        features: raw.features || featuresFromNotes(notes, duration),
        referenceHint: job.demo ? "demo-scale" : undefined,
        duration,
      }),
    );
    await update(job, {
      notes,
      src: base + "/media/" + job.id + "/input.mp4",
      status: "matching",
      progress: 90,
      message: "已解析演奏，正在查找匹配曲谱",
    });
    await findMatches(job);
  } catch (e) {
    await rm(input, { force: true });
    await update(job, {
      status: "error",
      progress: 0,
      message: e.message,
      error: e.message,
    });
  }
}
async function newJob(name) {
  const job = {
    id: randomUUID(),
    createdAt: Date.now(),
    name: name.slice(0, 120),
    status: "queued",
    progress: 0,
    message: "已加入处理队列",
    duration: 0,
    src: "",
    notes: [],
  };
  jobs.set(job.id, job);
  await save(job);
  return job;
}
app.get(base + "/api/health", (req, res) =>
  res.json({
    ok: true,
    engine: "Basic Pitch",
    renderer: "Remotion",
    maxDuration: 60,
    maxUploadMB: 80,
    queued: queue.length,
    busy: working,
  }),
);
app.post(
  base + "/api/jobs",
  (req, res, next) => {
    if (!hasRoom())
      return res.status(429).json({ error: "当前处理队列已满，请稍后再试" });
    upload.single("video")(req, res, (e) => (e ? next(e) : next()));
  },
  async (req, res) => {
    if (!req.file)
      return res
        .status(400)
        .json({ error: "请选择 MP4、MOV、WebM 或 M4V 视频" });
    if (!hasRoom()) {
      await rm(req.file.path, { force: true });
      return res.status(429).json({ error: "队列已满，请稍后再试" });
    }
    const job = await newJob(decodeUploadName(req.file.originalname));
    await enqueue(() => processVideo(job, req.file.path));
    res.status(202).json(publicJob(job));
  },
);
app.post(base + "/api/demo", async (req, res) => {
  if (!hasRoom())
    return res.status(429).json({ error: "当前处理队列已满，请稍后再试" });
  const job = await newJob("合成音阶示例.mp4");
  job.demo = true;
  const file = path.join(data, "uploads", job.id + ".mp4");
  await copyFile(path.join(root, "public/demo.mp4"), file);
  await enqueue(() => processVideo(job, file));
  res.status(202).json(publicJob(job));
});
app.get(base + "/api/jobs/:id", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job)
    return res
      .status(404)
      .json({ error: "作品不存在或已超过 6 小时，请重新上传" });
  res.json(publicJob(job));
});
app.get(base + "/api/catalog", async (req, res) => {
  try {
    const index = await catalog(),
      query = String(req.query.q || "")
        .trim()
        .slice(0, 100)
        .toLowerCase();
    const matches = query
      ? index.items
          .filter((item) => {
            const text = [item.title, item.composer, item.aliases]
              .join(" ")
              .toLowerCase();
            return query.split(/\s+/).every((part) => text.includes(part));
          })
          .slice(0, 24)
      : [];
    res.json({
      count: index.items.length,
      sources: index.sources,
      scope: "当前已接入的公开曲谱，不代表全网任意曲目",
      items: matches.map(scoreMeta),
    });
  } catch {
    res.status(503).json({ error: "曲谱库暂不可用，请稍后重试" });
  }
});
app.get(base + "/api/catalog/:id/preview", async (req, res) => {
  const index = await catalog(),
    meta = index.items.find((i) => i.id === req.params.id);
  if (!meta) return res.status(404).json({ error: "曲谱不存在" });
  const score = JSON.parse(
    await readFile(path.join(catalogDir, "scores", meta.id + ".json"), "utf8"),
  );
  const start = Math.max(0, Number(req.query.beat) || 0),
    groups = new Map();
  for (const n of score.events) {
    if (n.beat < start || n.beat >= start + 12) continue;
    const key = Math.round(n.beat * 1000),
      prev = groups.get(key);
    if (!prev || n.pitch > prev.pitch) groups.set(key, n);
  }
  res.json({
    title: meta.title,
    kind: meta.kind || "score",
    notes: [...groups.values()].slice(0, 24).map((n) => ({
      pitch: n.pitch,
      start: (n.beat - start) * 0.5,
      end: (n.beat - start + Math.min(n.length, 2)) * 0.5,
    })),
  });
});
app.post(base + "/api/jobs/:id/rematch", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "作品不存在或已过期" });
  if (!["ready", "done", "choose"].includes(job.status))
    return res.status(409).json({ error: "请先等待当前处理完成" });
  if (!hasRoom())
    return res.status(429).json({ error: "队列已满，请稍后重试" });
  if (job.matching?.candidates?.length) {
    await update(job, {
      status: "choose",
      message: "重新选择匹配曲目与版本",
      error: undefined,
    });
  } else {
    try {
      await stat(path.join(data, job.id, "analysis.json"));
    } catch {
      await writeFile(
        path.join(data, job.id, "analysis.json"),
        JSON.stringify({
          duration: job.duration,
          notes: job.notes,
          features: featuresFromNotes(job.notes, job.duration),
        }),
      );
    }
    await update(job, {
      status: "matching",
      progress: 90,
      error: undefined,
      message: "正在重新匹配曲谱",
    });
    await enqueue(() => findMatches(job));
  }
  res.status(202).json(publicJob(job));
});
app.post(base + "/api/jobs/:id/match", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "作品不存在或已过期" });
  if (!["choose", "ready", "done"].includes(job.status))
    return res.status(409).json({ error: "请先等待当前处理完成" });
  const index = await catalog(),
    meta = index.items.find((s) => s.id === req.body?.scoreId);
  if (!meta) return res.status(400).json({ error: "请选择曲谱库中的有效版本" });
  if (!hasRoom())
    return res.status(429).json({ error: "队列已满，请稍后重试" });
  await update(job, {
    status: "aligning",
    progress: 0,
    message: "正在将曲谱逐段对齐实际演奏",
    error: undefined,
    download: undefined,
  });
  await enqueue(async () => {
    try {
      const result = await matchAnalysis(job, "align", meta.id);
      await update(job, {
        notes: result.notes,
        reference: result.reference,
        reviewCount: result.reviewCount,
        matchDecision: "reference",
        status: "ready",
        progress: 100,
        message: "曲谱已对齐，试听并检查演奏差异",
        error: undefined,
      });
    } catch (e) {
      await update(job, {
        status: "choose",
        progress: 100,
        message: "此版本尚未对齐，请重新选择",
        error: e.message,
      });
    }
  });
  res.status(202).json(publicJob(job));
});
app.post(base + "/api/jobs/:id/use-draft", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "作品不存在或已过期" });
  if (!["choose", "ready", "done"].includes(job.status))
    return res.status(409).json({ error: "请先等待当前处理完成" });
  let notes;
  try {
    notes = JSON.parse(
      await readFile(path.join(data, job.id, "analysis.json"), "utf8"),
    ).notes;
  } catch {
    notes = job.notes;
  }
  await update(job, {
    notes,
    reference: undefined,
    reviewCount: undefined,
    matchDecision: "draft",
    status: "ready",
    progress: 100,
    message: "使用直接识别初稿，请校正后导出",
    error: undefined,
    download: undefined,
  });
  res.json(publicJob(job));
});
app.post(base + "/api/jobs/:id/render", async (req, res) => {
  const job = await getJob(req.params.id);
  if (!job) return res.status(404).json({ error: "作品不存在或已过期" });
  if (!["ready", "done"].includes(job.status))
    return res.status(409).json({
      error:
        job.status === "choose"
          ? "请先确认匹配曲目，或选择识别初稿"
          : "请先等待识别或合成完成",
    });
  if (!hasRoom())
    return res.status(429).json({ error: "合成队列已满，请稍后重试" });
  let settings;
  try {
    settings = validateRender(req.body, job.duration);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
  await update(job, {
    status: "rendering",
    progress: 0,
    message: "正在合成动态乐谱视频",
    download: undefined,
    error: undefined,
  });
  await enqueue(async () => {
    try {
      const { renderMedia } = await import("@remotion/renderer");
      const inputProps = {
        ...settings,
        fontSrc: `http://127.0.0.1:${port}/notetype/music.ttf`,
        src: `http://127.0.0.1:${port}${job.src}`,
      };
      const composition = {
        id: "NoteType",
        width: 960,
        height: 1280,
        fps: 30,
        durationInFrames: Math.ceil(job.duration * 30),
        props: inputProps,
        defaultProps: inputProps,
      };
      await renderMedia({
        serveUrl: path.join(root, "render-bundle"),
        composition,
        inputProps,
        codec: "h264",
        outputLocation: path.join(data, job.id, "output.mp4"),
        concurrency: 1,
        scale: 0.75,
        x264Preset: "veryfast",
        crf: 21,
        audioCodec: "aac",
        audioBitrate: "160k",
        offthreadVideoCacheSizeInBytes: 64 * 1024 * 1024,
        disallowParallelEncoding: true,
        browserExecutable: process.env.CHROME_PATH || undefined,
        onProgress: ({ progress }) => {
          job.progress = Math.round(progress * 100);
        },
        timeoutInMilliseconds: 90000,
      });
      await update(job, {
        status: "done",
        progress: 100,
        message: "合成完成，可以下载了",
        download: base + "/media/" + job.id + "/output.mp4",
      });
    } catch (e) {
      console.error("Render failed", e);
      await update(job, {
        status: "ready",
        progress: 100,
        message: "合成未完成，可重新导出",
        error: "合成未完成，请稍后重新导出",
      });
    }
  });
  res.status(202).json(publicJob(job));
});
app.get(base + "/media/:id/:file", async (req, res) => {
  if (!["input.mp4", "output.mp4"].includes(req.params.file))
    return res.sendStatus(404);
  const job = await getJob(req.params.id);
  if (!job) return res.sendStatus(404);
  res.set("Cache-Control", "private, max-age=0, no-store");
  if (req.params.file === "output.mp4")
    res.set(
      "Content-Disposition",
      'attachment; filename="notetype-performance.mp4"',
    );
  res.sendFile(path.join(data, job.id, req.params.file));
});
app.use(
  base,
  express.static(path.join(root, "dist"), {
    index: "index.html",
    maxAge: 3600000,
    setHeaders: (res, file) => {
      if (file.endsWith(".html")) res.set("Cache-Control", "no-cache");
    },
  }),
);
app.get(base, (req, res) => res.redirect(base + "/"));
app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.code === "LIMIT_FILE_SIZE" ? 413 : 400).json({
    error:
      err.code === "LIMIT_FILE_SIZE"
        ? "视频超过 80 MB，请先裁剪或压缩"
        : "请求未完成，请检查视频格式后重试",
  });
});
async function cleanup() {
  for (const name of await readdir(data)) {
    if (!/^[a-f0-9-]{36}$/.test(name)) continue;
    const dir = path.join(data, name);
    try {
      const j = JSON.parse(await readFile(path.join(dir, "job.json"), "utf8"));
      if (Date.now() - j.createdAt > TTL) {
        jobs.delete(name);
        await rm(dir, { recursive: true, force: true });
      }
    } catch {}
  }
  for (const f of await readdir(path.join(data, "uploads"))) {
    const p = path.join(data, "uploads", f);
    if (Date.now() - (await stat(p)).mtimeMs > TTL)
      await rm(p, { force: true });
  }
}
// Persisted jobs survive restarts; interrupted work is marked as retryable.
for (const name of await readdir(data)) {
  const job = await getJob(name);
  if (
    job &&
    [
      "queued",
      "extracting",
      "transcribing",
      "matching",
      "aligning",
      "rendering",
    ].includes(job.status)
  )
    await update(job, {
      status: job.matching ? "choose" : job.notes.length ? "ready" : "error",
      progress: job.notes.length ? 100 : 0,
      message: "服务已重启，请重试",
      error: "处理已中断，请重试",
    });
}
app.set("json spaces", 0);
await cleanup();
setInterval(() => cleanup().catch(console.error), 60000).unref();
app.listen(port, "127.0.0.1", () =>
  console.log("NoteType listening on " + port),
);
