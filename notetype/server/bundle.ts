import { bundle } from "@remotion/bundler";
await bundle({
  entryPoint: "src/remotion.tsx",
  outDir: process.cwd() + "/render-bundle",
  publicDir: "public",
  webpackOverride: (config) => config,
});
console.log("Remotion composition bundled.");
