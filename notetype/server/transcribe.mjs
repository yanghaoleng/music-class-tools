// A separate process keeps CPU inference from blocking uploads and job polling.
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { featuresFromModel } from "./matching.mjs";
const require = createRequire(import.meta.url);
const bpRequire = createRequire(require.resolve("@spotify/basic-pitch"));
const tf = bpRequire("@tensorflow/tfjs");
const {
  BasicPitch,
  outputToNotesPoly,
  noteFramesToTime,
} = require("@spotify/basic-pitch");
async function sendResult(message) {
  if (process.send)
    await new Promise((resolve, reject) =>
      process.send(message, (error) => (error ? reject(error) : resolve())),
    );
}
async function main() {
  await tf.setBackend("cpu");
  await tf.ready();
  const modelDir = path.join(
    path.dirname(require.resolve("@spotify/basic-pitch/package.json")),
    "model",
  );
  const json = JSON.parse(
    await readFile(path.join(modelDir, "model.json"), "utf8"),
  );
  const specs = json.weightsManifest.flatMap((g) => g.weights);
  const parts = [];
  for (const group of json.weightsManifest)
    for (const p of group.paths)
      parts.push(await readFile(path.join(modelDir, p)));
  const weights = Buffer.concat(parts);
  const model = await tf.loadGraphModel(
    tf.io.fromMemory({
      modelTopology: json.modelTopology,
      weightSpecs: specs,
      weightData: weights.buffer.slice(
        weights.byteOffset,
        weights.byteOffset + weights.byteLength,
      ),
    }),
  );
  const bytes = await readFile(process.argv[2]);
  const audio = new Float32Array(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
  const frames = [],
    onsets = [];
  const basicPitch = new BasicPitch(Promise.resolve(model));
  await basicPitch.evaluateModel(
    audio,
    (f, o) => {
      frames.push(...f);
      onsets.push(...o);
    },
    (p) => process.send?.({ progress: Math.round(p * 100) }),
  );
  const notes = noteFramesToTime(
    outputToNotesPoly(frames, onsets, 0.35, 0.25, 8, true, 4186, 27.5, true),
  )
    .map((n, i) => ({
      id: String(i),
      pitch: n.pitchMidi,
      start: Math.max(0, n.startTimeSeconds),
      end: n.startTimeSeconds + n.durationSeconds,
      confidence: n.amplitude,
    }))
    .filter((n) => n.end - n.start >= 0.08 && n.pitch >= 21 && n.pitch <= 108)
    .sort((a, b) => a.start - b.start);
  await sendResult({
    notes,
    features: featuresFromModel(frames, audio.length / 22050),
  });
  model.dispose();
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
