// scripts/build-server.cjs — bundle the TypeScript Express server into a
// single CommonJS file that Electron's main process can `require`. Keeps
// native-binary refs (ffmpeg-static, youtube-dl-exec) external so they
// resolve at runtime against the packaged app's node_modules / resources.
const path = require("node:path");
const fs = require("node:fs");
const esbuild = require("esbuild");

const channelData = /^(1|true|yes|on)$/i.test(
  String(process.env.VITE_ENABLE_CHANNEL_DATA || "").trim(),
);

const outFile = path.join(__dirname, "..", "electron", "dist", "server.cjs");
fs.mkdirSync(path.dirname(outFile), { recursive: true });

// Wrap the server so main.cjs can grab the http.Server handle for clean
// shutdown. server/index.ts calls app.listen(...) directly, so we monkey-patch
// listen to capture the returned server on module.exports.
const shim = `
const http = require('http');
const origCreate = http.createServer;
const capture = { server: null };
http.createServer = function (...args) {
  const s = origCreate.apply(this, args);
  capture.server = s;
  return s;
};
require(${JSON.stringify(path.resolve(__dirname, "..", "server", "index.ts"))});
module.exports = capture;
`;

const shimFile = path.join(__dirname, "..", "electron", "dist", "_entry.cjs");
fs.writeFileSync(shimFile, shim);

esbuild
  .build({
    entryPoints: [shimFile],
    outfile: outFile,
    bundle: true,
    platform: "node",
    target: "node18",
    format: "cjs",
    loader: { ".ts": "ts" },
    external: [
      "electron",
      "ffmpeg-static",
      "youtube-dl-exec",
    ],
    // Channel exporter. A public build never contains it: "./channelRoutes" is
    // resolved to an empty stub, so the module is not bundled at all. (esbuild
    // does not fold `if (CONST)` without minifying, and minifying is off so
    // support logs keep readable stack traces — a `define` would leave the
    // routes and their URLs in the file.) Only VITE_ENABLE_CHANNEL_DATA=1
    // bundles the real module.
    plugins: channelData
      ? []
      : [
          {
            name: "channel-routes-stub",
            setup(build) {
              build.onResolve({ filter: /(^|\/)channelRoutes$/ }, () => ({
                path: path.resolve(__dirname, "..", "server", "channelRoutes.stub.ts"),
              }));
            },
          },
        ],
    // The packaged app has no .env; bake the flag in so the runtime check in
    // server/index.ts agrees with what was bundled.
    define: {
      "process.env.VITE_ENABLE_CHANNEL_DATA": JSON.stringify(
        channelData ? "1" : "",
      ),
    },
    logLevel: "info",
  })
  .then(() => {
    fs.unlinkSync(shimFile);
    console.log("[build-server] wrote", outFile);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });