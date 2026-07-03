// electron/main.cjs — Electron main process. Starts one in-process Express
// backend on a free port, loads the built front-end, and shuts everything
// down cleanly on quit. No dev server ships; this file is CommonJS because
// the project's package.json sets "type": "module".
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const net = require("node:net");
const fs = require("node:fs");
const fsp = require("node:fs/promises");

const isDev = process.env.ELECTRON_DEV === "1";

// Single-instance lock — no duplicate backend, no duplicate window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let serverHandle = null; // { close(cb) } returned by the bundled server

function pickFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function resolveResourcesDir() {
  if (isDev) return path.resolve(__dirname, "..", "resources");
  return process.resourcesPath;
}

async function startBackend() {
  const port = await pickFreePort();
  process.env.PORT = String(port);
  process.env.ELECTRON_RESOURCES = resolveResourcesDir();

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
  const exe = (n) => (process.platform === "win32" ? `${n}.exe` : n);
  const check = (n) => (fs.existsSync(path.join(binDir, exe(n))) ? "ok" : "MISSING");
  console.log(
    `[electron] binDir=${binDir} (yt-dlp=${check("yt-dlp")}, ffmpeg=${check("ffmpeg")}, deno=${check("deno")})`,
  );

  const bundledServer = path.join(__dirname, "dist", "server.cjs");
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

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0B0B0C",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--api-base=http://127.0.0.1:${port}`],
    },
  });

  // Open external links in the user's browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:8080");
  } else {
    await mainWindow.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    const port = await startBackend();
    await createWindow(port);
    registerIpc();
  } catch (err) {
    console.error("[electron] failed to start:", err);
    app.quit();
  }
});

app.on("window-all-closed", () => {
  app.quit();
});

app.on("before-quit", () => {
  if (serverHandle && typeof serverHandle.close === "function") {
    try {
      serverHandle.close();
    } catch {
      /* ignore */
    }
  }
});

function registerIpc() {
  ipcMain.handle("dialog:pickDirectory", async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Choose download folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    return res.filePaths[0];
  });

  ipcMain.handle("file:save", async (_e, payload) => {
    try {
      if (!payload || typeof payload.dirPath !== "string" || typeof payload.filename !== "string") {
        return { ok: false, error: "Invalid save payload" };
      }
      const safeName = payload.filename.replace(/[\\/]/g, "_");
      const target = path.join(payload.dirPath, safeName);
      const buf = Buffer.from(payload.data);
      await fsp.writeFile(target, buf);
      return { ok: true, path: target };
    } catch (err) {
      return { ok: false, error: err && err.message ? err.message : "Save failed" };
    }
  });
}