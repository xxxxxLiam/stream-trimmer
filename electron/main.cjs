// electron/main.cjs — Electron main process. Starts one in-process Express
// backend on a free port, loads the built front-end, and shuts everything
// down cleanly on quit. No dev server ships; this file is CommonJS because
// the project's package.json sets "type": "module".
const {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  net: electronNet,
  shell,
} = require("electron");
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
const { detectDefaultBrowser } = require("./defaultBrowser.cjs");
const youtubeSession = require("./youtubeSession.cjs");
const { createSettingsStore } = require("./settingsStore.cjs");
const logger = require("./logger.cjs");


const isDev = process.env.ELECTRON_DEV === "1";

// Drag icon for native file drag-out, resolved once and reused. startDrag
// needs a non-empty icon synchronously or Windows cancels the drag outright.
let dragIcon = null;
function getDragIcon() {
  if (dragIcon && !dragIcon.isEmpty()) return dragIcon;
  try {
    const iconPath = path.join(__dirname, "icon.png");
    if (fs.existsSync(iconPath)) {
      dragIcon = nativeImage
        .createFromPath(iconPath)
        .resize({ width: 64, height: 64 });
    }
  } catch {
    dragIcon = null;
  }
  if (!dragIcon || dragIcon.isEmpty()) dragIcon = nativeImage.createEmpty();
  return dragIcon;
}

// Single-instance lock — no duplicate backend, no duplicate window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

let mainWindow = null;
let splashWindow = null;
// --- Persistent settings -------------------------------------------------
// Backed by a JSON file in userData (see settingsStore.cjs). Loaded and its
// IPC registered BEFORE the window exists, because the preload reads the
// snapshot synchronously while the window is being created.
let settings = null;

function loadSettings() {
  settings = createSettingsStore(
    path.join(app.getPath("userData"), "settings.json"),
  );
  settings.load();
}

let serverHandle = null; // { close(cb) } returned by the bundled server
// Loopback port the bundled backend listens on. Needed by verifyCookieFile,
// which asks the backend (and therefore yt-dlp) whether a saved sign-in is
// actually accepted by YouTube.
let backendPort = null;

// Verifies a freshly exported cookie file for real: the backend runs yt-dlp
// against YouTube with `--cookies <file>` and reports what it found. Returns
// { ok, message } so the sign-in window can stay open with the true reason.
async function verifyCookieFile(file) {
  if (!file || !fs.existsSync(file)) {
    return { ok: false, message: "No cookie file was written." };
  }
  if (!backendPort) {
    return { ok: false, message: "The local engine is not running yet." };
  }
  try {
    logger.log("youtube", "verify: asking the local engine");
    // Electron's net.fetch, not Node's global fetch: it is the supported
    // main-process HTTP client and goes through Chromium's stack.
    const res = await electronNet.fetch(
      `http://127.0.0.1:${backendPort}/api/auth/youtube/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ browser: "app" }),
        signal: AbortSignal.timeout(60000),
      },
    );
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      logger.log("youtube", `verify: non-JSON reply status=${res.status}`);
      return { ok: false, message: "The local engine returned an unexpected reply." };
    }
    logger.log("youtube", `verify: status=${data && data.status}`);
    return {
      ok: Boolean(data && data.status === "signed_in"),
      message: (data && (data.message || data.reason)) || undefined,
    };
  } catch (err) {
    logger.log("youtube", `verify failed: ${logger.describe(err)}`);
    return {
      ok: false,
      message: err && err.message ? err.message : "Verification failed.",
    };
  }
}

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
  process.env.ELECTRON_USER_DATA = app.getPath("userData");
  // Where the in-app sign-in stores its cookies. The backend resolves the
  // path from here and never accepts it from the renderer.
  process.env.YT_CLIPPER_COOKIE_FILE = youtubeSession.cookieFilePath();

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
  backendPort = port;
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


// Keeps the exported cookie file in step with the app's own YouTube session,
// so a session that is still alive never reads as expired. Local only — this
// reads Electron's own cookie jar and writes a file; it makes no network call.
let cookieRefreshTimer = null;
const COOKIE_REFRESH_MS = 60 * 60 * 1000;

let lastCookieRefresh = 0;
const COOKIE_REFRESH_MIN_GAP_MS = 60 * 1000;

function refreshCookieFile(why) {
  // The sign-in window runs its own export loop; a second one racing it only
  // risks writing the cookie file from two places at once.
  if (youtubeSession.isSigningIn()) return;
  const now = Date.now();
  if (now - lastCookieRefresh < COOKIE_REFRESH_MIN_GAP_MS) return;
  lastCookieRefresh = now;
  logger.log("youtube", `cookie refresh (${why}) starting`);
  youtubeSession
    .probe()
    .then((r) => logger.log("youtube", `cookie refresh (${why}) connected=${!!r.connected}`))
    .catch((err) =>
      logger.log("youtube", `cookie refresh (${why}) failed: ${logger.describe(err)}`),
    );
}

function startCookieRefresh() {
  refreshCookieFile("launch");
  if (cookieRefreshTimer) clearInterval(cookieRefreshTimer);
  cookieRefreshTimer = setInterval(() => refreshCookieFile("timer"), COOKIE_REFRESH_MS);
  cookieRefreshTimer.unref?.();
  app.on("browser-window-focus", () => refreshCookieFile("focus"));
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    logger.installCrashHandlers();
    // Must precede startBackend(): the backend runs in this process and its
    // console output is the only record of why yt-dlp rejected a session.
    logger.captureConsole();
    // Settings and IPC must be ready BEFORE the window exists: the preload
    // reads the settings snapshot synchronously during window creation.
    loadSettings();
    registerIpc();
    createSplash();
    const port = await startBackend();
    await createWindow(port);
    logger.watchWindow("main", mainWindow);
    startCookieRefresh();
    setupAutoUpdater();
  } catch (err) {
    logger.log("app", `failed to start: ${logger.describe(err)}`);
    closeSplash();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // Defensive: the sign-in window closing has previously coincided with the
  // whole app disappearing. If the main window is still alive, this event is
  // spurious and must not be read as "the user quit".
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.log("app", "window-all-closed ignored — main window still alive");
    return;
  }
  logger.log("app", "window-all-closed — quitting");
  app.quit();
});

app.on("before-quit", () => {
  if (cookieRefreshTimer) {
    clearInterval(cookieRefreshTimer);
    cookieRefreshTimer = null;
  }
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
    e.returnValue = settings ? settings.all() : {};
  });
  ipcMain.handle("settings:set", (_e, key, value) => {
    if (!settings) return { ok: false };
    return { ok: settings.set(key, value) };
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


  // Cheap existence probe so the Downloads list can dim rows whose file was
  // moved or deleted outside the app.
  ipcMain.handle("file:exists", (_e, targetPath) => {
    try {
      return typeof targetPath === "string" && targetPath
        ? fs.existsSync(targetPath)
        : false;
    } catch {
      return false;
    }
  });

  // Native OS drag-out. Must be ipcMain.on (not handle): startDrag has to run
  // synchronously inside the drag gesture or the OS drops it.
  ipcMain.on("file:startDrag", (event, targetPath) => {
    try {
      if (typeof targetPath !== "string" || !targetPath) return;
      if (!fs.existsSync(targetPath)) return;

      // Windows silently cancels a drag with a missing/empty icon, so always
      // hand over a real image. Per-file thumbnails are deliberately not used:
      // nativeImage.createThumbnailFromPath is async and startDrag must resolve
      // its icon synchronously inside the gesture. The app icon is cached once.
      event.sender.startDrag({ file: targetPath, icon: getDragIcon() });
    } catch (err) {
      console.error(
        "[electron] startDrag failed:",
        err && err.message ? err.message : err,
      );
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

  // In-app sign-in: opens a real YouTube login window in the app's own
  // persistent session and exports those cookies to a file yt-dlp can use.
  // Cookie values never reach the renderer — only a boolean.
  ipcMain.handle("youtube:connect", async () => {
    logger.log("youtube", "connect: requested");
    try {
      const result = await youtubeSession.openLoginWindow(
        mainWindow,
        (file) => verifyCookieFile(file),
        (msg) => logger.log("youtube", msg),
        (phase) => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send("youtube:progress", { phase });
          }
        },
      );
      logger.log(
        "youtube",
        `connect: finished connected=${!!result.connected} cancelled=${!!result.cancelled}`,
      );
      return {
        connected: !!result.connected,
        cancelled: !!result.cancelled,
        error: result.error,
      };
    } catch (err) {
      // A sign-in problem returns a normal failure to the UI; it never
      // escapes and takes the app with it.
      logger.log("youtube", `connect: threw ${logger.describe(err)}`);
      return {
        connected: false,
        cancelled: false,
        error: err && err.message ? err.message : "Sign-in failed",
      };
    }
  });

  // Cheap, offline check plus a cookie-file refresh so the session rolls
  // forward from the app's own storage on every launch.
  ipcMain.handle("youtube:probe", async () => {
    try {
      const result = await youtubeSession.probe();
      return { connected: !!result.connected, error: result.error };
    } catch (err) {
      logger.log("youtube", `probe: threw ${logger.describe(err)}`);
      return { connected: false, error: logger.describe(err) };
    }
  });

  ipcMain.handle("youtube:disconnect", async () => {
    try {
      await youtubeSession.clear();
      logger.log("youtube", "disconnect: cleared");
      return { ok: true };
    } catch (err) {
      logger.log("youtube", `disconnect: threw ${logger.describe(err)}`);
      return { ok: false };
    }
  });

  // --- Diagnostics ------------------------------------------------------
  // Surfaces the local log so a crash can be reported without hunting for a
  // hidden folder. Only event names and error messages are ever recorded.
  ipcMain.handle("diagnostics:read", () => ({
    path: logger.logFilePath(),
    text: logger.tail(500),
  }));

  ipcMain.handle("diagnostics:reveal", () => {
    try {
      const target = logger.logFilePath();
      if (!target || !fs.existsSync(target)) {
        return { ok: false, error: "No log file yet." };
      }
      shell.showItemInFolder(target);
      return { ok: true, path: target };
    } catch (err) {
      return { ok: false, error: logger.describe(err) };
    }
  });

  ipcMain.handle("diagnostics:copy", () => {
    try {
      clipboard.writeText(logger.tail(500));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: logger.describe(err) };
    }
  });

  // Fallback path only: opens YouTube in the user's default browser so
  // yt-dlp can read that browser's session instead.
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

  // Returns only the supported browser name. Cookie values remain private to
  // the browser and are read directly by the local yt-dlp process.
  ipcMain.handle("system:defaultBrowser", () => ({
    browser: detectDefaultBrowser(app),
  }));


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
