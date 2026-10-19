import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { test } from "node:test";
import assert from "node:assert/strict";
import { Score } from "../src/Film";
const notes = [
  { id: "one", pitch: 60, start: 0.5, end: 0.95, confidence: 1 },
  { id: "two", pitch: 64, start: 1.1, end: 1.6, confidence: 1 },
  { id: "three", pitch: 55, start: 3.6, end: 4.5, confidence: 1 },
];
const markup = (time: number) =>
  renderToStaticMarkup(<Score notes={notes} time={time} labels={false} />);
const positions = (html: string) =>
  [
    ...html.matchAll(
      /<ellipse[^>]+cx="([^"]+)" cy="([^"]+)"[^>]+transform="([^"]+)"/g,
    ),
  ].map((m) => m.slice(1));
test("shows upcoming notes before playback reaches them", () => {
  assert.equal(positions(markup(0)).length, 3);
});
test("playing a note adds glow without changing note geometry", () => {
  const before = markup(0.2),
    during = markup(0.7);
  assert.deepEqual(positions(during), positions(before));
  assert.equal((before.match(/filter="url/g) || []).length, 0);
  assert.equal((during.match(/filter="url/g) || []).length, 1);
});
test("keeps a sustained note visible and highlighted across a phrase boundary", () => {
  const html = markup(4.2);
  assert.equal(positions(html).length, 1);
  assert.equal((html.match(/filter="url/g) || []).length, 1);
});
