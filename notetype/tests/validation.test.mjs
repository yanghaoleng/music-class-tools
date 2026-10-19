import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRender, decodeUploadName } from "../server/validation.mjs";
const note = { pitch: 60, start: 0.2, end: 0.6 };
test("rejects invalid and out-of-video notes", () => {
  for (const notes of [
    [{ ...note, end: 11 }],
    [{ ...note, start: -1 }],
    [{ ...note, pitch: 200 }],
    [{ ...note, end: 0.1 }],
    [],
  ])
    assert.throws(() => validateRender({ notes }, 10));
});
test("sanitizes caller-controlled render inputs and sorts notes", () => {
  const result = validateRender(
    {
      notes: [{ ...note, start: 2, end: 3 }, note],
      src: "https://attacker.invalid",
      duration: 999,
      offset: 0.1,
      theme: "night",
      labels: false,
    },
    10,
  );
  assert.equal(result.duration, 10);
  assert.equal(result.src, undefined);
  assert.equal(result.notes[0].start, 0.2);
  assert.equal(result.theme, "night");
  assert.equal(result.labels, false);
});
test("rejects non-finite timing and excessive offsets", () => {
  assert.throws(() => validateRender({ notes: [{ ...note, start: NaN }] }, 10));
  assert.throws(() => validateRender({ notes: [note], offset: 2 }, 10));
});

test("preserves Chinese multipart file names", () => {
  assert.equal(
    decodeUploadName(Buffer.from("钢琴演奏.mp4", "utf8").toString("latin1")),
    "钢琴演奏.mp4",
  );
  assert.equal(decodeUploadName("钢琴演奏.mp4"), "钢琴演奏.mp4");
  assert.equal(decodeUploadName("scale.mp4"), "scale.mp4");
});
