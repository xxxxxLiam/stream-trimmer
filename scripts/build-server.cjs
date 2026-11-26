// scripts/build-server.cjs — bundle the TypeScript Express server into a
// single CommonJS file that Electron's main process can `require`. Keeps
// native-binary refs (ffmpeg-static, youtube-dl-exec) external so they
// resolve at runtime against the packaged app's node_modules / resources.
const path = require("node:path");
const fs = require("node:fs");
const esbuild = require("esbuild");
const { esbuildMaps } = require("./sourcemaps.cjs");

const channelData = /^(1|true|yes|on)$/i.test(
  String(process.env.VITE_ENABLE_CHANNEL_DATA || "").trim(),
);

// The owner gate's list and salt. Read like Vite reads them (process env first,
// then .env) and baked into the bundle ONLY when the channel exporter is built
// in. A public build defines nothing, so the values (and even their names) are
// absent from it no matter what is in the shell or .env.
function ownerSetting(name) {
  const fromEnv = String(process.env[name] || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const raw = fs.readFileSync(path.join(__dirname, "..", ".env"), "utf8");
    const line = raw.split(/\r?\n/).find((l) => l.startsWith(`${name}=`));
    return (line ? line.split("=").slice(1).join("=") : "").trim();
  } catch {
    return "";
  }
}

// BUILD_SERVER_OUT lets a test build into a scratch folder instead of out/main.
const outFile = process.env.BUILD_SERVER_OUT
  ? path.resolve(process.env.BUILD_SERVER_OUT)
  : path.join(__dirname, "..", "out", "main", "engine.cjs");
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
require(${JSON.stringify(path.resolve(__dirname, "..", "src", "main", "features", "engine", "index.ts"))});
module.exports = capture;
`;

// The main process cannot see Vite's defines, so an owner build also writes what
// it was baked with to a sidecar next to the server bundle (electron/ownerCheck.ts
// reads it; its keys are deliberately plain, that file ships in every build). A public build writes nothing and removes any stale one a previous
// owner build left behind, so "no sidecar" means "no exporter". The folder name
// is the same one src/renderer/src/shared/utils/campaigns.ts uses when the exporter is built.
const shapeFile = path.join(path.dirname(outFile), "build-shape.json");
if (channelData) {
  fs.writeFileSync(
    shapeFile,
    JSON.stringify({
      list: ownerSetting("VITE_OWNER_MACHINES"),
      salt: ownerSetting("VITE_OWNER_SALT"),
      dataFolderName: "channel-data",
    }),
  );
} else {
  fs.rmSync(shapeFile, { force: true });
}

const shimFile = path.join(path.dirname(outFile), "_entry.cjs");
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
                path: path.resolve(__dirname, "..", "src", "main", "features", "engine", "routes", "channelRoutes.stub.ts"),
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
      ...(channelData
        ? {
            "process.env.VITE_OWNER_MACHINES": JSON.stringify(ownerSetting("VITE_OWNER_MACHINES")),
            "process.env.VITE_OWNER_SALT": JSON.stringify(ownerSetting("VITE_OWNER_SALT")),
          }
        : {}),
    },
    ...esbuildMaps(),
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