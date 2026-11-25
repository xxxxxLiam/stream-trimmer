/**
 * File: engineHost.ts
 * Path: src/main/modules/engineHost/engineHost.ts
 * Description: Starts the in-process Express engine on a free port and shuts it
 *   down. The engine is the bundle scripts/build-server.cjs writes next to this
 *   one (out/main/engine.cjs); it is required at runtime, not imported, so the
 *   bundle can be built, stubbed and tested on its own.
 */
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import electron from "electron";
import * as youtubeSession from "../../features/youtube/services/youtubeSession";
import { isDev } from "../../shared/utils/env";

const { app } = electron;

let serverHandle: any = null; // { close(cb) } returned by the bundled server

export function pickFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as net.AddressInfo;
      srv.close(() => resolve(port));
    });
  });
}

export function resolveResourcesDir() {
  if (isDev) return path.resolve(__dirname, "..", "..", "resources");
  return process.resourcesPath;
}

export async function startBackend() {
  const port = await pickFreePort();
  process.env.PORT = String(port);
  process.env.ELECTRON_RESOURCES = resolveResourcesDir();
  process.env.ELECTRON_USER_DATA = app.getPath("userData");
  // Where the imported cookies.txt lives. The backend resolves the path from
  // here and never accepts it from the renderer.
  process.env.YT_CLIPPER_COOKIE_FILE = youtubeSession.cookieFilePath();
  // Where the app keeps a yt-dlp it fetched itself (silent tool updates).
  process.env.YT_CLIPPER_TOOLS_DIR = path.join(app.getPath("userData"), "tools");
  // The processes the engine starts are listed here, so a hard kill of the app cannot leave one running.
  process.env.YT_CLIPPER_CHILDREN_FILE = path.join(app.getPath("userData"), "engine-children.json");

  // Serve the built UI from the same local server so the window loads over
  // http://127.0.0.1 instead of file://. YouTube embeds refuse to render in a
  // null-origin (file://) frame, which is why the preview used to stay blank.
  const uiDir = path.join(__dirname, "..", "..", "dist");
  if (!isDev && fs.existsSync(path.join(uiDir, "index.html"))) {
    process.env.ELECTRON_UI_DIR = uiDir;
  }

  // Ensure bundled binaries (yt-dlp, ffmpeg, deno for JS-challenge solving)
  // are visible to any spawned child by prepending resources/bin to PATH.
  const binDir = path.join(resolveResourcesDir(), "bin");
  const sep = process.platform === "win32" ? ";" : ":";
  const currentPath = process.env.PATH || "";
  if (!currentPath.split(sep).includes(binDir)) {
    process.env.PATH = `${binDir}${sep}${currentPath}`;
  }
  process.env.ELECTRON_RESOURCES_BIN = binDir;

  // Startup diagnostic — confirms binaries are in place before the server
  // starts spawning yt-dlp.
  const exe = (n: string) => (process.platform === "win32" ? `${n}.exe` : n);
  const check = (n: string) =>
    fs.existsSync(path.join(binDir, exe(n))) ? "ok" : "MISSING";
  console.log(
    `[electron] binDir=${binDir} (yt-dlp=${check("yt-dlp")}, ffmpeg=${check("ffmpeg")}, deno=${check("deno")})`,
  );

  const bundledServer = path.join(__dirname, "engine.cjs");
  if (!fs.existsSync(bundledServer)) {
    throw new Error(
      `Bundled server missing at ${bundledServer}. Run \`npm run build:electron\`.`,
    );
  }
  // The bundled server exports a { server } object (see scripts/build-server.cjs).
  const mod = require(bundledServer);
  serverHandle = mod && mod.server ? mod.server : null;
  return port;
}

/** Closes the engine's http.Server, if one was started. Never throws. */
export function stopBackend() {
  if (serverHandle && typeof serverHandle.close === "function") {
    try {
      serverHandle.close();
    } catch {
      /* ignore */
    }
  }
}
