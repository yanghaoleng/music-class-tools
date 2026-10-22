import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const origin = process.env.XIANJI_URL || "http://127.0.0.1:5186/xianji/";
const browser = await chromium.launch({ channel: "chrome", headless: true });
const errors = [];
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
});
await context.addInitScript(() => {
  window.__audioContexts = [];
  const Native = window.AudioContext;
  window.AudioContext = class extends Native {
    constructor(...args) {
      super(...args);
      this.__compressors = [];
      window.__audioContexts.push(this);
    }
    createDynamicsCompressor() {
      const node = super.createDynamicsCompressor();
      this.__compressors.push(node);
      return node;
    }
  };
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
async function click(label) {
  await page.getByRole("button", { name: label, exact: true }).click();
}
async function draw(page, points) {
  const r = await page.locator(".music-canvas").boundingBox();
  await page.mouse.move(
    r.x + r.width * points[0][0],
    r.y + r.height * points[0][1],
  );
  await page.mouse.down();
  for (const [x, y] of points.slice(1))
    await page.mouse.move(r.x + r.width * x, r.y + r.height * y, { steps: 14 });
  await page.mouse.up();
}
try {
  await page.goto(origin);
  await page.getByRole("button", { name: "播放", exact: true }).waitFor();
  assert.equal(await page.locator(".music-canvas path").count(), 3);
  await click("播放");
  await page.getByRole("button", { name: "暂停", exact: true }).waitFor();
  await page.waitForTimeout(350);
  const audio = await page.evaluate(async () => {
    const ctx = window.__audioContexts.at(-1),
      analyser = ctx.createAnalyser();
    ctx.__compressors.at(-1).connect(analyser);
    analyser.connect(ctx.destination);
    let peak = 0;
    const data = new Float32Array(analyser.fftSize);
    for (let k = 0; k < 8; k++) {
      await new Promise((r) => setTimeout(r, 90));
      analyser.getFloatTimeDomainData(data);
      peak = Math.max(
        peak,
        Math.sqrt(data.reduce((s, x) => s + x * x, 0) / data.length),
      );
    }
    analyser.disconnect();
    return { state: ctx.state, rms: peak };
  });
  assert.equal(audio.state, "running");
  assert.ok(audio.rms > 0.0001, JSON.stringify(audio));
  console.log("PASS audible playback graph", audio);
  await click("暂停");
  await click("从头开始");
  assert.match(await page.locator(".time-display").textContent(), /00:00/);
  await click("新建画布");
  await page.getByLabel("作品名称", { exact: true }).fill("溪谷里的旋律");
  await draw(page, [
    [0.06, 0.65],
    [0.3, 0.2],
    [0.55, 0.58],
    [0.85, 0.3],
  ]);
  assert.equal(await page.locator(".music-canvas path").count(), 1);
  await page.getByLabel("画笔颜色 #bd747a", { exact: true }).click();
  await click("添加声部");
  await page
    .getByRole("button", { name: "拨弦 短促，轻快的弦声", exact: true })
    .click();
  await draw(page, [
    [0.1, 0.85],
    [0.4, 0.75],
    [0.8, 0.85],
  ]);
  assert.equal(await page.locator(".music-canvas path").count(), 2);
  await click("撤销");
  assert.equal(await page.locator(".music-canvas path").count(), 1);
  await click("重做");
  assert.equal(await page.locator(".music-canvas path").count(), 2);
  await page.getByLabel("速度 BPM", { exact: true }).fill("72");
  await page.getByLabel("音阶", { exact: true }).selectOption("minor");
  await click("保存作品");
  await page.waitForTimeout(850);
  await page.reload();
  await page.getByLabel("作品名称", { exact: true }).waitFor();
  assert.equal(
    await page.getByLabel("作品名称", { exact: true }).inputValue(),
    "溪谷里的旋律",
  );
  assert.equal(await page.locator(".music-canvas path").count(), 2);
  await page
    .locator(".topbar nav button")
    .filter({ hasText: "我的作品" })
    .click();
  await page.getByLabel("搜索作品", { exact: true }).fill("溪谷");
  assert.equal(await page.locator(".project-card").count(), 1);
  await click("慢慢流动");
  assert.equal(await page.locator(".project-card").count(), 1);
  await click("活力节奏");
  assert.equal(await page.locator(".project-card").count(), 0);
  await click("全部作品");
  await click("复制 溪谷里的旋律");
  assert.match(
    await page.getByLabel("作品名称", { exact: true }).inputValue(),
    /副本/,
  );
  await click("保存作品");
  await page
    .locator(".topbar nav button")
    .filter({ hasText: "我的作品" })
    .click();
  await page.getByLabel("搜索作品", { exact: true }).fill("副本");
  assert.equal(await page.locator(".project-card").count(), 1);
  await click("删除 溪谷里的旋律 · 副本");
  await click("删除作品");
  assert.equal(await page.locator(".project-card").count(), 0);
  await page.getByLabel("搜索作品", { exact: true }).fill("溪谷");
  await page
    .locator(".project-card")
    .getByRole("button", { name: "溪谷里的旋律", exact: true })
    .click();
  await click("导出");
  const dl = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "弦迹作品文件", exact: false })
    .click();
  const download = await dl;
  const json = await fs.readFile(await download.path(), "utf8");
  assert.equal(JSON.parse(json).strokes.length, 2);
  await click("导出");
  const wavEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "音频 WAV", exact: false }).click();
  const wav = await wavEvent,
    bytes = await fs.readFile(await wav.path());
  assert.equal(bytes.toString("ascii", 0, 4), "RIFF");
  let max = 0;
  for (let i = 44; i < bytes.length; i += 2)
    max = Math.max(max, Math.abs(bytes.readInt16LE(i)));
  assert.ok(max > 100);
  console.log("PASS WAV audio", bytes.length, "bytes, peak", max);
  await click("新建画布");
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "roundtrip.xianji.json",
      mimeType: "application/json",
      buffer: Buffer.from(json),
    });
  await page.waitForTimeout(150);
  assert.equal(
    await page.getByLabel("作品名称", { exact: true }).inputValue(),
    "溪谷里的旋律",
  );
  assert.equal(await page.locator(".music-canvas path").count(), 2);
  await click("橡皮擦 (E)");
  const r = await page.locator(".music-canvas").boundingBox();
  await page.mouse.click(r.x + r.width * 0.1, r.y + r.height * 0.85);
  assert.equal(await page.locator(".music-canvas path").count(), 1);
  await click("撤销");
  assert.equal(await page.locator(".music-canvas path").count(), 2);
  await click("删除声部 2");
  await click("删除声部");
  assert.equal(await page.locator(".music-canvas path").count(), 1);
  await click("撤销");
  assert.equal(await page.locator(".music-canvas path").count(), 2);
  await click("使用指南");
  await page.keyboard.press("Escape");
  assert.equal(await page.getByRole("dialog").count(), 0);
  await click("专注模式");
  assert.equal(await page.locator(".sidebar").isVisible(), false);
  await page.keyboard.press("Escape");
  await page.screenshot({
    path: "/tmp/xianji-tested-desktop.png",
    fullPage: true,
  });
  if (new URL(origin).hostname === "127.0.0.1") {
    const offlineAudio = await page.evaluate(async () => {
      const root = location.pathname;
      const { renderWav } = await import(root + "src/audio.mjs");
      const { makeDemo, compile } = await import(root + "src/model.mjs");
      const results = [];
      for (const name of ["keys", "bell", "pluck", "pad", "bass"]) {
        const doc = makeDemo();
        doc.bars = 2;
        doc.tracks.forEach((t) => (t.instrument = name));
        const blob = await renderWav(doc),
          buf = new DataView(await blob.arrayBuffer());
        let energy = 0;
        for (let i = 44; i < buf.byteLength; i += 2)
          energy += Math.abs(buf.getInt16(i, true));
        results.push({ name, energy, notes: compile(doc).length });
      }
      return results;
    });
    assert.ok(offlineAudio.every((r) => r.energy > 1000));
    console.log("PASS five synthesized instruments", offlineAudio);
  }
  const mobile = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  const mp = await mobile.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mp.goto(origin);
  await mp.getByRole("button", { name: "新建画布", exact: true }).click();
  const box = await mp.locator(".music-canvas").boundingBox();
  const session = await mobile.newCDPSession(mp);
  const tp = (x, y) => ({
    x: box.x + x * box.width,
    y: box.y + y * box.height,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [tp(0.05, 0.5)],
  });
  for (let i = 1; i <= 15; i++)
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [tp(0.05 + i * 0.055, 0.5 + Math.sin(i / 3) * 0.2)],
    });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(await mp.locator(".music-canvas path").count(), 1);
  assert.equal(
    await mp.evaluate(() => document.documentElement.scrollWidth > innerWidth),
    false,
  );
  await mp.getByRole("button", { name: "灵感示例", exact: true }).click();
  await mp.getByRole("button", { name: "雨落在窗边", exact: false }).click();
  assert.equal(
    await mp.getByLabel("作品名称", { exact: true }).inputValue(),
    "雨落在窗边",
  );
  await mp.screenshot({
    path: "/tmp/xianji-tested-mobile.png",
    fullPage: true,
  });
  for (const w of [320, 360, 768, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "horizontal overflow at " + w,
    );
  }
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS persistence, save/search/filter, duplicate/delete, project import/export, undo/redo, erase, tracks, dialogs, touch drawing and responsive widths",
  );
} finally {
  await browser.close();
}
