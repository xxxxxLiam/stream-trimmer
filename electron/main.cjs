// electron/main.cjs — Electron main process. Starts one in-process Express
// backend on a free port, loads the built front-end, and shuts everything
// down cleanly on quit. No dev server ships; this file is CommonJS because
// the project's package.json sets "type": "module".
const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const net = require("node:net");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
// electron-updater — free auto-updates via GitHub Releases. Reads
// latest.yml / latest-mac.yml / latest-linux.yml uploaded by
// electron-builder alongside each release's installer.
// NOTE: macOS auto-update requires a signed + notarized build. Until this
// app is signed, mac users must download new versions manually; we handle
// the resulting error gracefully instead of crashing.
const { autoUpdater } = require("electron-updater");

const isDev = process.env.ELECTRON_DEV === "1";

// Single-instance lock — no duplicate backend, no duplicate window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
// --- Persistent settings -------------------------------------------------
// The renderer is served from a random loopback port, so localStorage is
// wiped on every launch. Settings therefore live in a JSON file in userData.
let settingsPath = null;
let settingsCache = {};

function loadSettings() {
  try {
    settingsPath = path.join(app.getPath("userData"), "settings.json");
    settingsCache = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    if (!settingsCache || typeof settingsCache !== "object") settingsCache = {};
  } catch {
    settingsCache = {};
  }
}

function persistSettings() {
  try {
    if (!settingsPath) return;
    fs.writeFileSync(settingsPath, JSON.stringify(settingsCache, null, 2));
  } catch (err) {
    console.error("[electron] failed to persist settings:", err);
  }
}

let serverHandle = null; // { close(cb) } returned by the bundled server

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", payload);
  }
}

function setupAutoUpdater() {
  if (isDev) return; // never hit GitHub during dev
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] checking for update");
    sendUpdateStatus({ state: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    console.log("[updater] update available", info && info.version);
    sendUpdateStatus({ state: "available", version: info && info.version });
  });
  autoUpdater.on("update-not-available", () => {
    console.log("[updater] no update available");
    sendUpdateStatus({ state: "none" });
  });
  autoUpdater.on("download-progress", (p) => {
    const percent = Math.round(p && p.percent ? p.percent : 0);
    sendUpdateStatus({ state: "downloading", percent });
  });
  autoUpdater.on("update-downloaded", async (info) => {
    console.log("[updater] update downloaded", info && info.version);
    sendUpdateStatus({ state: "ready", version: info && info.version });
    try {
      const res = await dialog.showMessageBox(mainWindow, {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Update ready",
        message: `Version ${info && info.version} has been downloaded.`,
        detail: "Restart the app to apply the update.",
      });
      if (res.response === 0) autoUpdater.quitAndInstall();
    } catch (err) {
      console.error("[updater] restart dialog failed:", err);
    }
  });
  autoUpdater.on("error", (err) => {
    const message = (err && err.message) || String(err);
    console.error("[updater] error:", message);
    // On unsigned macOS builds this fires with a code-signature error.
    // Surface a "download manually" hint instead of crashing.
    sendUpdateStatus({ state: "error", message });
  });

  // Fire the initial check shortly after window is ready.
  autoUpdater.checkForUpdatesAndNotify().catch((err) => {
    console.error("[updater] initial check failed:", err);
  });
}

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

  // Serve the built UI from the same local server so the window loads over
  // http://127.0.0.1 instead of file://. YouTube embeds refuse to render in a
  // null-origin (file://) frame, which is why the preview used to stay blank.
  const uiDir = path.join(__dirname, "..", "dist");
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
  const exe = (n) => (process.platform === "win32" ? `${n}.exe` : n);
  const check = (n) =>
    fs.existsSync(path.join(binDir, exe(n))) ? "ok" : "MISSING";
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

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 320,
    height: 220,
    frame: false,
    resizable: false,
    movable: true,
    center: true,
    show: false,
    transparent: false,
    backgroundColor: "#0B0B0C",
    skipTaskbar: true,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  splashWindow.loadFile(path.join(__dirname, "splash.html"));
  splashWindow.once("ready-to-show", () => {
    if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show();
  });
  splashWindow.on("closed", () => {
    splashWindow = null;
  });
}

function closeSplash() {
  if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
  splashWindow = null;
}

async function createWindow(port) {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 900,
    minHeight: 600,
    backgroundColor: "#0B0B0C",
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      additionalArguments: [`--api-base=http://127.0.0.1:${port}`],
    },
  });

  mainWindow.once("ready-to-show", () => {
    closeSplash();
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.show();
  });

  // Open external links in the user's browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) {
    await mainWindow.loadURL("http://localhost:8080");
  } else {
    try {
      await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
    } catch (err) {
      // Emergency fallback — the app still works, minus the video preview.
      console.error("[electron] http load failed, falling back to file://", err);
      await mainWindow.loadFile(
        path.join(__dirname, "..", "dist", "index.html"),
      );
    }
  }

  // Safety net: never leave the app invisible if ready-to-show never fires.
  setTimeout(() => {
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      closeSplash();
      mainWindow.show();
    }
  }, 8000);
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
    loadSettings();
    registerIpc();
    setupAutoUpdater();
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
  // Synchronous snapshot so the renderer can seed state before first paint.
  ipcMain.on("settings:all", (e) => {
    e.returnValue = settingsCache;
  });
  ipcMain.handle("settings:set", (_e, key, value) => {
    if (typeof key !== "string" || !key) return { ok: false };
    if (value === null || value === undefined) delete settingsCache[key];
    else settingsCache[key] = value;
    persistSettings();
    return { ok: true };
  });

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
      if (
        !payload ||
        typeof payload.dirPath !== "string" ||
        typeof payload.filename !== "string"
      ) {
        return { ok: false, error: "Invalid save payload" };
      }
      const safeName = payload.filename.replace(/[\\/]/g, "_");
      const target = path.join(payload.dirPath, safeName);
      const buf = Buffer.from(payload.data);
      await fsp.writeFile(target, buf);
      return { ok: true, path: target };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : "Save failed",
      };
    }
  });
  // Writes a set of text files into a new subfolder — used by the channel
  // exporter, which produces several linked CSVs per run.
  ipcMain.handle("file:saveFiles", async (_e, payload) => {
    try {
      if (
        !payload ||
        typeof payload.dirPath !== "string" ||
        typeof payload.folder !== "string" ||
        !Array.isArray(payload.files)
      ) {
        return { ok: false, error: "Invalid save payload" };
      }
      const safeFolder = payload.folder.replace(/[\\/]/g, "_");
      const target = path.join(payload.dirPath, safeFolder);
      await fsp.mkdir(target, { recursive: true });
      for (const file of payload.files) {
        if (!file || typeof file.name !== "string") continue;
        const safeName = file.name.replace(/[\\/]/g, "_");
        await fsp.writeFile(
          path.join(target, safeName),
          String(file.contents ?? ""),
          "utf8",
        );
      }
      return { ok: true, path: target };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : "Save failed",
      };
    }
  });


  ipcMain.handle("file:showInFolder", (_e, targetPath) => {
    try {
      if (typeof targetPath !== "string" || !targetPath) {
        return { ok: false, error: "No path" };
      }
      // Highlights the file in Finder/Explorer (opens the folder if the file
      // is gone). Points right at the clip rather than just opening the dir.
      shell.showItemInFolder(targetPath);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : "Failed to reveal",
      };
    }
  });

  ipcMain.handle("updater:check", async () => {
    if (isDev) return { ok: false, error: "Updates disabled in dev" };
    try {
      const result = await autoUpdater.checkForUpdates();
      return {
        ok: true,
        version: result && result.updateInfo && result.updateInfo.version,
      };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : "Check failed",
      };
    }
  });

  // Opens YouTube's sign-in page in the user's default browser. The app
  // never sees credentials — it later reuses the browser's session cookies
  // via yt-dlp. https://www.youtube.com/signin redirects to Google sign-in.
  ipcMain.handle("shell:openYouTubeSignIn", async () => {
    try {
      await shell.openExternal("https://www.youtube.com/signin");
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : "Failed to open browser",
      };
    }
  });

  ipcMain.handle("updater:quitAndInstall", () => {
    try {
      autoUpdater.quitAndInstall();
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : "Install failed",
      };
    }
  });
}
