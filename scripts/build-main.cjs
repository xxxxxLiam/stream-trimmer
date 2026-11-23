// scripts/build-main.cjs — compile the Electron main process and its preload
// (TypeScript) into the two CommonJS files Electron loads:
//   out/main/index.cjs     the main process
//   out/preload/index.cjs  the preload bridge
// The engine is bundled separately by scripts/build-server.cjs into
// out/main/engine.cjs, and main requires it at runtime by that path.
//
// "electron" and "electron-updater" stay external: the first is the runtime
// itself and the second is shipped in the packaged app's node_modules.
const path = require("node:path");
const esbuild = require("esbuild");

const root = path.join(__dirname, "..");
// BUILD_MAIN_OUT lets a test build into a scratch folder instead of out/.
const outRoot = process.env.BUILD_MAIN_OUT
  ? path.resolve(process.env.BUILD_MAIN_OUT)
  : path.join(root, "out");

const common = {
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  loader: { ".ts": "ts" },
  external: ["electron", "electron-updater"],
  logLevel: "info",
};

Promise.all([
  esbuild.build({
    ...common,
    entryPoints: [path.join(root, "src", "main", "index.ts")],
    outfile: path.join(outRoot, "main", "index.cjs"),
  }),
  esbuild.build({
    ...common,
    entryPoints: [path.join(root, "electron", "preload.ts")],
    outfile: path.join(outRoot, "preload", "index.cjs"),
  }),
])
  .then(() => console.log("[build-main] wrote", outRoot))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
