import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  rankCatalog,
  alignFeatures,
  alignScoreNotes,
  describeMatch,
  fitRegister,
} from "./matching.mjs";
async function sendResult(message) {
  if (process.send)
    await new Promise((resolve, reject) =>
      process.send(message, (error) => (error ? reject(error) : resolve())),
    );
}
async function main() {
  const analysis = JSON.parse(await readFile(process.argv[2], "utf8")),
    catalogDir = process.argv[3],
    mode = process.argv[4] || "search",
    requested = process.argv[5];
  const index = JSON.parse(
    await readFile(path.join(catalogDir, "index.json"), "utf8"),
  );
  if (mode === "align") {
    const meta = index.items.find((s) => s.id === requested);
    if (!meta) throw Error("曲谱不存在");
    const score = JSON.parse(
      await readFile(
        path.join(catalogDir, "scores", meta.id + ".json"),
        "utf8",
      ),
    );
    const variants = rankCatalog(analysis, [meta], 1),
      shifts = variants[0]?.shifts || [0];
    let best = null;
    for (const shift of shifts) {
      const fit = alignFeatures(analysis, score, shift);
      if (fit && (!best || fit.similarity > best.similarity)) best = fit;
    }
    best = fitRegister(analysis, score, best);
    const notes = alignScoreNotes(analysis, score, best);
    await sendResult({
      result: {
        notes,
        reference: describeMatch(meta, best),
        reviewCount: notes.filter((n) => n.review).length,
      },
    });
    return;
  }
  const ranked = rankCatalog(analysis, index.items),
    matches = [];
  // The bundled teaching demo has a known source; do not present this as blind recognition.
  if (
    analysis.referenceHint === "demo-scale" &&
    !ranked.some((r) => r.item.id === "demo-scale")
  ) {
    const demo = index.items.find((item) => item.id === "demo-scale");
    if (demo) ranked.unshift(...rankCatalog(analysis, [demo], 1));
  }
  for (let i = 0; i < ranked.length; i++) {
    const { item, shifts } = ranked[i],
      score = JSON.parse(
        await readFile(
          path.join(catalogDir, "scores", item.id + ".json"),
          "utf8",
        ),
      );
    let best = null;
    for (const shift of shifts) {
      const fit = alignFeatures(analysis, score, shift);
      if (fit && (!best || fit.similarity > best.similarity)) best = fit;
    }
    if (best)
      matches.push(describeMatch(item, fitRegister(analysis, score, best)));
    process.send?.({ progress: Math.round(((i + 1) / ranked.length) * 100) });
  }
  matches.sort((a, b) => b.similarity - a.similarity);
  const top = matches.slice(0, 6);
  await sendResult({
    result: {
      candidates: top,
      coverage: index.items.length,
      credible: top.some((c) => c.level !== "weak"),
      method: "soft-chroma-subsequence-dtw",
      scope: "public-score-catalog",
    },
  });
}
main()
  .then(() => process.exit(0))
  .catch((e) => {
    process.send?.({ error: e.message });
    console.error(e.message);
    process.exit(1);
  });
