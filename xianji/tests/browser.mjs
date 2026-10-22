import { chromium } from "playwright";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
const origin = process.env.XIANJI_URL || "http://127.0.0.1:5186/xianji/";
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  args: ["--autoplay-policy=document-user-activation-required"],
});
const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
  }),
  errors = [];
await context.addInitScript(() => {
  const Native = window.AudioContext;
  window.__contexts = [];
  window.AudioContext = class extends Native {
    constructor(...a) {
      super(...a);
      this.__compressors = [];
      window.__contexts.push(this);
    }
    createDynamicsCompressor() {
      const n = super.createDynamicsCompressor();
      this.__compressors.push(n);
      return n;
    }
  };
});
const page = await context.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const button = (name) => page.getByRole("button", { name, exact: true });
async function click(name) {
  await button(name).click();
}
async function close() {
  await click("关闭");
  await page.getByRole("dialog").waitFor({ state: "detached" });
}
async function draw(p, points) {
  const r = await p.locator(".music-canvas").boundingBox();
  await p.mouse.move(
    r.x + r.width * points[0][0],
    r.y + r.height * points[0][1],
  );
  await p.mouse.down();
  for (const [x, y] of points.slice(1))
    await p.mouse.move(r.x + r.width * x, r.y + r.height * y, { steps: 12 });
  await p.mouse.up();
}
async function audioRms() {
  return page.evaluate(async () => {
    const ctx = window.__contexts.at(-1),
      a = ctx.createAnalyser();
    ctx.__compressors[0].connect(a);
    a.connect(ctx.destination);
    let rms = 0;
    const data = new Float32Array(a.fftSize);
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 100));
      a.getFloatTimeDomainData(data);
      rms = Math.max(
        rms,
        Math.sqrt(data.reduce((n, v) => n + v * v, 0) / data.length),
      );
    }
    a.disconnect();
    return { state: ctx.state, rms };
  });
}
try {
  await page.goto(origin);
  await button("暂停").waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 0);
  assert.equal(await page.locator(".grid-lines").count(), 0);
  assert.equal(
    await page.locator("body").getByText("弦迹", { exact: true }).count(),
    0,
  );
  const r = await page.locator(".music-canvas").boundingBox();
  assert.equal(r.width, 1440);
  assert.equal(r.height, 1000);
  const x1 = await page.locator(".playhead line").getAttribute("x1");
  await page.waitForTimeout(250);
  const x2 = await page.locator(".playhead line").getAttribute("x1");
  assert.notEqual(x1, x2, "visual playback starts before any gesture");
  const blocked = await page.evaluate(() => window.__contexts[0].state);
  assert.equal(
    blocked,
    "suspended",
    "test really exercises browser autoplay blocking",
  );
  // The first canvas interaction must unlock sound and draw, without a play click.
  const p1 = [0.07, 0.61],
    box = await page.locator(".music-canvas").boundingBox();
  await page.mouse.move(box.width * p1[0], box.height * p1[1]);
  await page.mouse.down();
  await page.mouse.move(box.width * 0.8, box.height * 0.35, { steps: 35 });
  await page.waitForTimeout(180);
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 1);
  assert.equal(
    await page.evaluate(() => window.__contexts[0].state),
    "running",
  );
  const liveAudio = await audioRms();
  assert.ok(liveAudio.rms > 0.0001);
  await page.mouse.up();
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 1);
  console.log(
    "PASS immediate visual playback, first-stroke audio unlock and live line",
    liveAudio,
  );
  await click("画笔与音色");
  await page.getByRole("dialog").waitFor();
  await page.getByLabel("画笔颜色 #dc4f98", { exact: true }).click();
  await page
    .getByRole("button", { name: "拨弦 短促，轻快的弦声", exact: true })
    .click();
  await close();
  assert.equal(
    await page.evaluate(() =>
      document.activeElement.getAttribute("aria-label"),
    ),
    "画笔与音色",
  );
  await draw(page, [
    [0.12, 0.76],
    [0.4, 0.65],
    [0.83, 0.79],
  ]);
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 2);
  await click("撤销");
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 1);
  await click("重做");
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 2);
  assert.equal(
    await button("暂停").count(),
    1,
    "undo keeps immersive playback running",
  );
  await click("声部混音");
  await click("添加声部");
  await close();
  await draw(page, [
    [0.17, 0.2],
    [0.5, 0.3],
    [0.88, 0.17],
  ]);
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 3);
  await click("旋律规则");
  await page.getByLabel("速度 BPM", { exact: true }).fill("72");
  await page.getByLabel("音阶", { exact: true }).selectOption("minor");
  await close();
  await click("画布菜单");
  await page.getByLabel("作品名称", { exact: true }).fill("紫色的回声");
  await page
    .getByRole("button", { name: "保存作品 收进本机作品集", exact: true })
    .click();
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await page.waitForTimeout(750);
  await page.reload();
  await button("暂停").waitFor();
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 3);
  await click("我的作品");
  await page.getByLabel("搜索作品", { exact: true }).fill("紫色");
  assert.equal(await page.locator(".project-card").count(), 1);
  await click("慢慢流动");
  assert.equal(await page.locator(".project-card").count(), 1);
  await click("活力节奏");
  assert.equal(await page.locator(".project-card").count(), 0);
  await click("全部作品");
  await click("复制 紫色的回声");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await click("保存作品");
  await click("我的作品");
  await page.getByLabel("搜索作品", { exact: true }).fill("副本");
  assert.equal(await page.locator(".project-card").count(), 1);
  await click("删除 紫色的回声 · 副本");
  await click("删除作品");
  await page.getByLabel("搜索作品", { exact: true }).fill("紫色");
  assert.equal(await page.locator(".project-card").count(), 1);
  await click("打开 紫色的回声");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  await click("导出");
  const projectEvent = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "可编辑作品文件", exact: false })
    .click();
  const project = await projectEvent,
    json = await fs.readFile(await project.path(), "utf8");
  assert.equal(JSON.parse(json).strokes.length, 3);
  await page.getByRole("dialog").waitFor({ state: "detached" });
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
  await page.getByRole("dialog").waitFor({ state: "detached" });
  console.log("PASS WAV with real audio", bytes.length, max);
  await click("画布菜单");
  await click("新建画布 从一张空白开始");
  await page.getByRole("dialog").waitFor({ state: "detached" });
  assert.equal(await button("暂停").count(), 1);
  await page
    .locator("input[type=file]")
    .setInputFiles({
      name: "roundtrip.json",
      mimeType: "application/json",
      buffer: Buffer.from(json),
    });
  await page.waitForTimeout(200);
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 3);
  await click("橡皮擦 (E)");
  await page.mouse.click(1440 * 0.12, 1000 * 0.76);
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 2);
  await click("撤销");
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 3);
  await click("声部混音");
  await click("删除声部 2");
  await click("删除声部");
  await close();
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 2);
  await click("撤销");
  assert.equal(await page.locator(".music-canvas [data-material="dry-pigment"] path").count(), 3);
  await click("画布菜单");
  await page.getByRole("button", { name: "图标方案", exact: false }).click();
  assert.equal(await page.locator(".icon-choice").count(), 4);
  await click("方案 D 声纹笔触");
  await close();
  assert.match(
    await page.locator(".canvas-menu img").getAttribute("src"),
    /option-d/,
  );
  await page.reload();
  assert.match(
    await page.locator(".canvas-menu img").getAttribute("src"),
    /option-d/,
  );
  // All panel opening and closing paths have real motion and restore the canvas.
  for (const name of ["画笔与音色", "旋律规则", "声部混音", "我的作品"]) {
    await click(name);
    await page.getByRole("dialog").waitFor();
    await page.keyboard.press("Tab");
    assert.equal(
      await page.evaluate(
        () => document.activeElement.closest("[role=dialog]") !== null,
      ),
      true,
    );
    await page.keyboard.press("Escape");
    await page.getByRole("dialog").waitFor({ state: "detached" });
  }
  await fs.mkdir("artifacts", { recursive: true });
  await page.screenshot({
    path: "artifacts/immersive-desktop.png",
    fullPage: true,
  });
  await click("画布菜单");
  await page.getByRole("button", { name: "图标方案", exact: false }).click();
  await page.waitForTimeout(450);
  await page
    .locator("[role=dialog]")
    .screenshot({ path: "artifacts/icon-options.png" });
  await close();
  for (const w of [320, 360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width: w, height: 900 });
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "horizontal overflow " + w,
    );
    await click("画笔与音色");
    await page.waitForTimeout(100);
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth > innerWidth,
      ),
      false,
      "modal overflow " + w,
    );
    await close();
  }
  const mobile = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true,
    }),
    mp = await mobile.newPage();
  mp.on("pageerror", (e) => errors.push(e.message));
  await mp.goto(origin);
  await mp.getByRole("button", { name: "暂停", exact: true }).waitFor();
  const mb = await mp.locator(".music-canvas").boundingBox(),
    cdp = await mobile.newCDPSession(mp),
    tp = (x, y) => ({ x: mb.x + mb.width * x, y: mb.y + mb.height * y });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [tp(0.15, 0.3)],
  });
  for (let i = 1; i <= 12; i++)
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [tp(0.15 + i * 0.05, 0.3 + Math.sin(i / 3) * 0.1)],
    });
  await cdp.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  assert.equal(await mp.locator(".music-canvas [data-material="dry-pigment"] path").count(), 1);
  await mp.screenshot({
    path: "artifacts/immersive-mobile.png",
    fullPage: true,
  });
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log(
    "PASS immersive canvas, library, imports/exports, all glass panels, focus, icon selection, touch and responsive layout",
  );
} finally {
  await browser.close();
}
