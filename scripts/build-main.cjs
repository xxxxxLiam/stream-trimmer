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
const { esbuildMaps } = require("./sourcemaps.cjs");
const { isHardened, esbuildHardeningOptions, collectLegalComments, obfuscateFile } = require("./buildHardening.cjs");

const root = path.join(__dirname, "..");
const hardened = isHardened();
// BUILD_MAIN_OUT lets a test build into a scratch folder instead of out/.
const outRoot = process.env.BUILD_MAIN_OUT
  ? path.resolve(process.env.BUILD_MAIN_OUT)
  : path.join(root, "out");

// The channel exporter's save code is part of the main process too. A public build aliases it to a stub
// (like build-server.cjs does for the routes), so "ytchan-" and the export writer are not in the file.
const channelData = /^(1|true|yes|on)$/i.test(String(process.env.VITE_ENABLE_CHANNEL_DATA || "").trim());
const exporterStub = {
  name: "export-service-stub",
  setup(build) {
    build.onResolve({ filter: /(^|\/)exportService$/ }, () => ({
      path: path.resolve(__dirname, "..", "src", "main", "features", "exports", "services", "exportService.stub.ts"),
    }));
  },
};

const common = {
  plugins: channelData ? [] : [exporterStub],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  loader: { ".ts": "ts" },
  external: ["electron", "electron-updater"],
  ...esbuildMaps(),
  logLevel: "info",
  ...esbuildHardeningOptions(hardened),
};

const mainOut = path.join(outRoot, "main", "index.cjs");
const preloadOut = path.join(outRoot, "preload", "index.cjs");

Promise.all([
  esbuild.build({ ...common, entryPoints: [path.join(root, "src", "main", "index.ts")], outfile: mainOut }),
  esbuild.build({ ...common, entryPoints: [path.join(root, "src", "preload", "index.ts")], outfile: preloadOut }),
])
  .then(() => {
    collectLegalComments(mainOut, "the main process");
    collectLegalComments(preloadOut, "the preload bridge");
    if (hardened) {
      obfuscateFile(mainOut);
      obfuscateFile(preloadOut);
    }
    console.log(`[build-main] wrote ${outRoot}${hardened ? " (hardened)" : " (readable: CLIPR_DEV_BUILD)"}`);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
