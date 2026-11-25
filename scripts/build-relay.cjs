// scripts/build-relay.cjs: bundle the crash-report relay into ONE self-contained file, relay/dist/worker.js, that can be
// pasted into the Cloudflare dashboard. BUILD_RELAY_OUT lets a test build into a scratch folder.
const path = require("node:path");
const esbuild = require("esbuild");

const outFile = process.env.BUILD_RELAY_OUT
  ? path.resolve(process.env.BUILD_RELAY_OUT)
  : path.join(__dirname, "..", "relay", "dist", "worker.js");

esbuild
  .build({
    entryPoints: [path.join(__dirname, "..", "relay", "src", "worker.ts")],
    outfile: outFile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    target: "es2022",
    loader: { ".ts": "ts" },
    logLevel: "info",
  })
  .then(() => console.log("[build-relay] wrote", outFile))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
