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
  shell,
} = require("electron");
const path = require("node:path");
const net = require("node:net");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
// electron-updater — free auto-updates via GitHub Releases. Reads
// latest.yml / latest-mac.yml / latest-linux.yml uploaded by
// electron-builder alongside each release's installer.
// NOTE: macOS auto-update requires a signed + notarized build. Until this
// app is signed, mac users must download new versions manually; we handle
// the resulting error gracefully instead of crashing.
const { autoUpdater } = require("electron-updater");
const {
  browserCheckOrder,
  detectDefaultBrowser,
} = require("./defaultBrowser.cjs");
const youtubeSession = require("./youtubeSession.cjs");
const { createSettingsStore } = require("./settingsStore.cjs");
const { saveExportFiles } = require("./exportSave.cjs");
const {
  allowedRoots,
  dragTarget,
  moveWithoutOverwrite,
  resolveTarget,
  writeWithoutOverwrite,
} = require("./pathSafety.cjs");
const { interpretCheckResult } = require("./updateCheck.cjs");
const { redact } = require("./redact.cjs");
const {
  canInstallInPlace,
  downloadUrl,
  releasesUrl,
} = require("./updater.cjs");
const logger = require("./logger.cjs");
const { readMachineId, hashMachineId } = require("./machineId.cjs");
const { createOwnerCheck, readBakedShape } = require("./ownerCheck.cjs");
// Read once, at start: what this build was baked with. Absent in a public build.
const bakedShape = readBakedShape(path.join(__dirname, "dist"));
const ownerGate = createOwnerCheck({ readMachineId, hashMachineId, getBaked: () => bakedShape });


const isDev = process.env.ELECTRON_DEV === "1";
// Whether an update can be downloaded and restarted into, or only offered as
// a download. See electron/updater.cjs.
const canInstall = canInstallInPlace(process.platform);

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

// The app was renamed from "YouTube Clipper" to "Clipr" in 4.0.2. Electron
// derives userData from the product name, so the new build looks in a new,
// empty directory and every existing user would silently lose their
// campaigns, clip bank, folder choices and YouTube sign-in.
//
// This copies the old directory's contents across, once, before anything
// reads them. It never overwrites: if a file already exists under the new
// name it is left alone, so a user who has started fresh is not clobbered,
// and a second run is a no-op. The old directory is left in place — if this
// goes wrong, the data is still where it was.
function migrateLegacyUserData() {
  try {
    const current = app.getPath("userData");
    const legacy = path.join(path.dirname(current), "YouTube Clipper");
    if (legacy === current || !fs.existsSync(legacy)) return;
    // Only a first run: if settings are already here, the move has happened
    // (or the user has real data under the new name) and we must not touch it.
    if (fs.existsSync(path.join(current, "settings.json"))) return;

    fs.mkdirSync(current, { recursive: true });
    let moved = 0;
    for (const entry of fs.readdirSync(legacy, { withFileTypes: true })) {
      const from = path.join(legacy, entry.name);
      const to = path.join(current, entry.name);
      if (fs.existsSync(to)) continue;
      try {
        fs.cpSync(from, to, { recursive: true, errorOnExist: false });
        moved += 1;
      } catch (err) {
        console.error(`[electron] could not carry over ${entry.name}:`, err);
      }
    }
    if (moved) console.log(`[electron] carried ${moved} item(s) over from "YouTube Clipper"`);
  } catch (err) {
    // Never let this stop the app starting: a fresh profile is recoverable,
    // a boot loop is not.
    console.error("[electron] user data migration skipped:", err);
  }
}
migrateLegacyUserData();

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
    {
      log: (message) => logger.log("settings", message),
      // Null in a public build, so the migration never names the exporter's folder.
      dataFolderName: bakedShape ? bakedShape.dataFolderName || null : null,
    },
  );
  settings.load();
}

// Every reader of the log goes through here. The log can hold cookie rows,
// bearer tokens, signed URLs, an email and the home path, so no handler reads
// the raw file text (logger.tail) itself; electron/diagnosticsPath.test.ts
// fails if one does. A new reader calls readLogScrubbed() and is safe by default.
function scrubForDisplay(text) {
  return redact(String(text ?? ""), { homeDir: os.homedir() });
}
function readLogScrubbed(lines = 500) {
  return scrubForDisplay(logger.tail(lines));
}

let serverHandle = null; // { close(cb) } returned by the bundled server

function sendUpdateStatus(payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send("updater:status", payload);
  }
}

function setupAutoUpdater() {
  if (isDev) return; // never hit GitHub during dev
  // On macOS the download is pointless — see canInstallInPlace — so the check
  // runs but nothing is fetched, and the UI offers the installer instead.
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;
  autoUpdater.logger = console;
  logger.log(
    "updater",
    `install in place: ${canInstall ? "yes" : "no (macOS is unsigned)"}`,
  );

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] checking for update");
    sendUpdateStatus({ state: "checking" });
  });
  autoUpdater.on("update-available", (info) => {
    const version = info && info.version;
    logger.log("updater", `update available: ${version}`);
    if (!canInstall) {
      // Nothing is downloading, so say what is actually on offer and where to
      // get it rather than showing a progress bar that will never move.
      sendUpdateStatus({
        state: "manual",
        version,
        url: downloadUrl(process.platform, version),
      });
      return;
    }
    sendUpdateStatus({ state: "available", version });
  });
  autoUpdater.on("update-not-available", () => {
    logger.log("updater", "no update available");
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
    // Logged to the diagnostics file, not just the console: "the update
    // button didn't work" is unanswerable without the actual error.
    logger.log("updater", `error: ${message}`);
    sendUpdateStatus({ state: "error", message, url: releasesUrl() });
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
  // Where the imported cookies.txt lives. The backend resolves the path from
  // here and never accepts it from the renderer.
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
    // The window may not be smaller than the clipping loop needs. At the old
    // 900x600 floor the mark bar and the Cut button could never be on screen
    // together, so every single clip cost a scroll; the old 1100 default was
    // also narrower than the three-column breakpoint, so a first launch got
    // the stacked fallback. Both are the same mistake — advertising a size
    // the app does not actually work at.
    width: 1280,
    height: 820,
    minWidth: 1160,
    minHeight: 760,
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

  // Cmd+W must close the TAB, not the window.
  //
  // No application menu is set, so Electron keeps its default one, and on macOS a menu
  // accelerator wins before the page ever sees the key: Cmd+W would close the whole
  // window with every tab in it, which is not what any browser does and not what the
  // shortcut in the tab strip promises. preventDefault here stops the menu accelerator
  // firing while still delivering the key to the renderer, which closes the tab.
  //
  // Only this one chord, and only on macOS, where the conflict exists; Windows and Linux
  // already let the page handle it first. Cmd+Shift+W is left alone as the way to close
  // the window, matching browsers.
  if (process.platform === "darwin") {
    mainWindow.webContents.on("before-input-event", (event, input) => {
      if (
        input.type === "keyDown" &&
        input.meta &&
        !input.shift &&
        !input.control &&
        !input.alt &&
        input.key.toLowerCase() === "w"
      ) {
        event.preventDefault();
      }
    });
  }

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


// Notices when the imported cookies.txt has run out, while the app is open.
//
// There is nothing left to refresh: the file is the session, and the app has
// no way to renew it — the user re-exports one when it expires. What this
// still buys is the log line. An expired file otherwise shows up as a
// download that quietly comes back at 360p, hours after the expiry, with
// nothing in the diagnostics saying why. Read-only, and no network call.
let cookieCheckTimer = null;
const COOKIE_CHECK_MS = 60 * 60 * 1000;

let lastCookieCheck = 0;
const COOKIE_CHECK_MIN_GAP_MS = 60 * 1000;

function checkCookieFile(why) {
  // Focus fires in bursts — alt-tab, a dialog closing, the updater toast —
  // so without a floor one window switch re-reads the file several times.
  const now = Date.now();
  if (now - lastCookieCheck < COOKIE_CHECK_MIN_GAP_MS) return;
  lastCookieCheck = now;
  youtubeSession
    .probe()
    .then((r) =>
      logger.log(
        "youtube",
        `cookie check (${why}) connected=${!!r.connected} source=${r.source}${
          r.expired ? " expired" : ""
        }`,
      ),
    )
    .catch((err) =>
      logger.log("youtube", `cookie check (${why}) failed: ${logger.describe(err)}`),
    );
}

function startCookieChecks() {
  checkCookieFile("launch");
  if (cookieCheckTimer) clearInterval(cookieCheckTimer);
  cookieCheckTimer = setInterval(() => checkCookieFile("timer"), COOKIE_CHECK_MS);
  cookieCheckTimer.unref?.();
  app.on("browser-window-focus", () => checkCookieFile("focus"));
}

// A clip handed to the renderer but never saved (a crash, a quit mid-save)
// leaves its temp directory behind. These folders also hold the partial
// downloads that make a failed clip resumable, so they are kept for a week.
function sweepStaleClips() {
  try {
    const root = os.tmpdir();
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    let removed = 0;
    for (const name of fs.readdirSync(root)) {
      if (!name.startsWith("ytclip-")) continue;
      // Cookie copies are owned by server/cookieJar.ts, which sweeps its own.
      if (name.startsWith("ytclip-cookies-")) continue;
      const dir = path.join(root, name);
      try {
        if (fs.statSync(dir).mtimeMs > cutoff) continue;
        fs.rmSync(dir, { recursive: true, force: true });
        removed += 1;
      } catch {
        /* in use, or gone already */
      }
    }
    if (removed) logger.log("clip", `swept ${removed} stale temp folder(s)`);
  } catch (err) {
    logger.log("clip", `sweep failed: ${logger.describe(err)}`);
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
    sweepStaleClips();
    startCookieChecks();
    setupAutoUpdater();
  } catch (err) {
    logger.log("app", `failed to start: ${logger.describe(err)}`);
    closeSplash();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // Defensive: a secondary window closing — the splash, on a slow launch —
  // has previously coincided with the whole app disappearing. If the main
  // window is still alive, this event is spurious and must not be read as
  // "the user quit".
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

// Folders the user picked in the native dialog this session. Together with the
// folders saved in settings they are the only places the save handlers write.
const pickedDirs = new Set();
function saveRoots() {
  return allowedRoots(settings ? settings.all() : {}, [...pickedDirs]);
}

function registerIpc() {
  // Synchronous snapshot so the renderer can seed state before first paint.
  ipcMain.on("settings:all", (e) => {
    e.returnValue = settings ? settings.all() : {};
  });
  ipcMain.handle("settings:set", (_e, key, value) => {
    if (!settings) return { ok: false };
    return { ok: settings.set(key, value) };
  });

  ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickDirectory", async () => { const res = await dialog.showOpenDialog(mainWindow, { title: "Choose a folder", properties: ["openDirectory", "createDirectory"] }); if (res.canceled || res.filePaths.length === 0) return null; pickedDirs.add(res.filePaths[0]); return res.filePaths[0]; }); ipcMain.handle("dialog:pickFcpLibrary", async () => {
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Choose your Final Cut Pro library",
      message: "Pick the library that clips should be sent to.",
      defaultPath: path.join(app.getPath("home"), "Movies"),
      // A library is a package, which macOS treats as a file, so openFile is what makes it selectable.
      properties: ["openFile", "openDirectory"],
      filters: [{ name: "Final Cut Pro Library", extensions: ["fcpbundle"] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const picked = res.filePaths[0];
    if (!/\.fcpbundle$/i.test(picked)) {
      await dialog.showMessageBox(mainWindow, {
        type: "info",
        message: "That is not a Final Cut Pro library.",
        detail: "Libraries end in .fcpbundle. Pick one from your Movies folder or wherever you keep them.",
      });
      return null;
    }
    // Deliberately not added to pickedDirs: that list is where the app may write clips.
    return picked;
  });


  // Moves a finished clip from the engine's temp directory to where the user
  // wants it. The media never enters the renderer: it is written once by
  // yt-dlp and moved once here, instead of being streamed into the UI,
  // buffered, and copied back across IPC.
  ipcMain.handle("clip:save", async (_e, payload) => {
    try {
      if (
        !payload ||
        typeof payload.tempPath !== "string" ||
        typeof payload.dirPath !== "string" ||
        typeof payload.filename !== "string"
      ) {
        return { ok: false, error: "Invalid save payload" };
      }

      // The path comes back from the local engine, but never trust it blindly:
      // only ever move a file the engine just created inside its own temp dir.
      const source = fs.realpathSync(payload.tempPath);
      const tempRoot = fs.realpathSync(os.tmpdir());
      const prefix = path.join(tempRoot, "ytclip-");
      if (!path.dirname(source).startsWith(prefix)) {
        logger.log("clip", `refused save from outside the temp dir`);
        return { ok: false, error: "Unexpected clip location" };
      }

      const dest = resolveTarget({
        dirPath: payload.dirPath,
        name: payload.filename,
        roots: saveRoots(),
      });
      if (!dest.ok) {
        logger.log("clip", "refused save outside the chosen folders");
        return { ok: false, error: dest.error };
      }
      // Never replace a clip that is already there: add " 2", " 3" like the
      // CapCut copy does. A hard link fails with EEXIST instead of replacing,
      // so this holds even if the name is taken between the check and the move.
      await fsp.mkdir(path.dirname(dest.target), { recursive: true }); const target = await moveWithoutOverwrite(source, dest.target);
      await fsp.rm(path.dirname(source), { recursive: true, force: true });
      logger.log("clip", `saved ${path.basename(target)}`);
      return { ok: true, path: target };
    } catch (err) {
      logger.log("clip", `save failed: ${logger.describe(err)}`);
      return { ok: false, error: logger.describe(err) };
    }
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
      const dest = resolveTarget({
        dirPath: payload.dirPath,
        name: payload.filename,
        roots: saveRoots(),
      });
      if (!dest.ok) {
        logger.log("file", "refused save outside the chosen folders");
        return { ok: false, error: dest.error };
      }
      const buf = Buffer.from(payload.data);
      // "wx": never replace a file that is already there; " 2", " 3" instead.
      const target = await writeWithoutOverwrite(dest.target, buf);
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
      const folder = resolveTarget({
        dirPath: payload.dirPath,
        name: payload.folder,
        roots: saveRoots(),
      });
      if (!folder.ok) {
        logger.log("file", "refused export folder outside the chosen folders");
        return { ok: false, error: folder.error };
      }
      const target = folder.target;
      // Check every name before creating anything, so a bad one leaves no
      // half-written folder behind.
      const named = [];
      for (const file of payload.files) {
        if (!file || typeof file.name !== "string") continue;
        const dest = resolveTarget({ dirPath: target, name: file.name });
        if (!dest.ok) return { ok: false, error: dest.error };
        named.push([dest.target, String(file.contents ?? "")]);
      }
      await fsp.mkdir(target, { recursive: true });
      for (const [dest, contents] of named) {
        await fsp.writeFile(dest, contents, "utf8");
      }
      return { ok: true, path: target };
    } catch (err) {
      return {
        ok: false,
        error: err && err.message ? err.message : "Save failed",
      };
    }
  });


  // Moves a finished channel export out of the engine's temp dir, the same
  // way clip:save moves a finished clip. The CSVs themselves never enter the
  // renderer: a whole-channel export is millions of caption lines, and
  // routing that through a JSON response and back across IPC is what used to
  // run the app out of memory.
  ipcMain.handle("export:save", async (_e, payload) => {
    try {
      // Owner-only, like the exporter that produces these folders. A refusal
      // carries no hint the feature exists.
      if (!(await ownerGate.isOwner())) return { ok: false, error: "Could not save." };
      const result = await saveExportFiles({
        dirPath: payload?.dirPath,
        folder: payload?.folder,
        files: payload?.files,
        tmpRoot: os.tmpdir(),
        allowedRoots: saveRoots(),
      });
      logger.log(
        "export",
        result.ok
          ? `saved ${payload.files.length} file(s) to ${result.path}`
          : `refused: ${result.error}`,
      );
      return result;
    } catch (err) {
      logger.log("export", `save failed: ${logger.describe(err)}`);
      return { ok: false, error: logger.describe(err) };
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
      // Only the app's own window, and only a real file inside the folders the
      // user chose. (The preload also refuses unless a genuine dragstart just
      // happened: calling startDrag with no gesture in progress is what wedged
      // the main process.)
      if (!mainWindow || event.sender !== mainWindow.webContents) return;
      const real = dragTarget(targetPath, saveRoots());
      if (!real) {
        logger.log("drag", "refused drag of a path outside the chosen folders");
        return;
      }
      targetPath = real;

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
      logger.log("updater", "manual check requested");
      const result = await autoUpdater.checkForUpdates();
      const outcome = interpretCheckResult(result, app.getVersion());
      if (outcome.kind === "error") {
        // The check never ran (it resolved to null): say so, never "Up to date".
        logger.log("updater", "manual check did not run");
        sendUpdateStatus({
          state: "error",
          message: outcome.message,
          url: releasesUrl(),
        });
        return { ok: false, error: outcome.message };
      }
      // checkForUpdates resolves without emitting update-not-available when
      // there is nothing new, so the caller gets told either way.
      if (outcome.kind === "none") sendUpdateStatus({ state: "none" });
      return { ok: true, version: result.updateInfo.version };
    } catch (err) {
      const error = err && err.message ? err.message : "Check failed";
      logger.log("updater", `manual check failed: ${error}`);
      sendUpdateStatus({ state: "error", message: error, url: releasesUrl() });
      return { ok: false, error };
    }
  });

  // Cheap, offline read of the imported cookies.txt. Says whether a session
  // is on disk at all; whether YouTube still accepts it is the engine's
  // /api/auth/youtube/status check, which costs a real request.
  ipcMain.handle("youtube:probe", async () => {
    try {
      const result = await youtubeSession.probe();
      return {
        connected: !!result.connected,
        error: result.error,
        expiresAt: result.expiresAt ?? null,
        expired: !!result.expired,
      };
    } catch (err) {
      logger.log("youtube", `probe: threw ${logger.describe(err)}`);
      return { connected: false, error: logger.describe(err) };
    }
  });

  // Import a cookies.txt the user exported from their own browser. On Windows
  // this is the only route that reliably works — see cookieFile.cjs.
  ipcMain.handle("youtube:importCookies", async () => {
    try {
      const res = await dialog.showOpenDialog(mainWindow, {
        title: "Choose the cookies.txt you exported",
        properties: ["openFile"],
        filters: [
          { name: "Cookies", extensions: ["txt"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (res.canceled || res.filePaths.length === 0) {
        return { ok: false, cancelled: true };
      }
      const result = await youtubeSession.importCookieFile(res.filePaths[0]);
      logger.log(
        "youtube",
        `cookie import ok=${result.ok}${result.ok ? ` cookies=${result.count}` : `: ${result.error}`}`,
      );
      return result;
    } catch (err) {
      logger.log("youtube", `cookie import threw: ${logger.describe(err)}`);
      return { ok: false, error: logger.describe(err) };
    }
  });

  // A cookies.txt dropped on the window. The renderer reads the text; the
  // same validation and atomic commit as the picker runs here.
  ipcMain.handle("youtube:importCookiesText", async (_e, text) => {
    try {
      if (typeof text !== "string" || text.length > 5_000_000) {
        return { ok: false, error: "That does not look like a cookies.txt file." };
      }
      const result = await youtubeSession.importCookieText(text);
      logger.log(
        "youtube",
        `cookie drop ok=${result.ok}${result.ok ? ` cookies=${result.count}` : `: ${result.error}`}`,
      );
      return result;
    } catch (err) {
      logger.log("youtube", `cookie drop threw: ${logger.describe(err)}`);
      return { ok: false, error: logger.describe(err) };
    }
  });

  // Owner gate: is this computer on the build's allowlist? Answers a boolean
  // and nothing else. The list and salt come from the renderer bundle because
  // this file is not bundled by Vite. Never logs or returns the id or hash.
  // The arguments are ignored: main answers from what this build was baked with,
  // so a page cannot choose its own answer. export:save asks the same gate.
  ipcMain.handle("owner:check", () => ownerGate.check());

  // Editor handoff (BUILD-SPEC 11c): editor:installed / probe / writeFcpxml /
  // openWith / reveal / copyFiles. Failures come back as { ok:false, error }.
  require("./editorOpen.cjs").registerEditorHandlers({ ipcMain, shell });

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
    path: scrubForDisplay(logger.logFilePath() || ""),
    text: readLogScrubbed(),
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
      // The log can hold cookie rows, bearer tokens, signed URLs, the user's
      // email and home path. Scrub it here, in the process that owns the
      // clipboard, so no caller can put the raw text there.
      clipboard.writeText(readLogScrubbed());
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

  // Somewhere to put clips on a fresh install, so nobody has to decide before
  // their first cut. With no clips folder set, useClipper's deliverPath gate is
  // false and the whole finished file streams through the renderer into
  // ~/Downloads instead of the main process moving it — slower, and the clips
  // scatter. The folders are created here because clip:save does not create its
  // target, and they become allowed save roots once the renderer stores them
  // (allowedRoots reads them back out of settings).
  //
  // This never overwrites a choice: the renderer only asks when nothing is set.
  ipcMain.handle("system:defaultFolders", async () => {
    try {
      const base = path.join(app.getPath("videos"), "Clipr");
      const clipsDir = path.join(base, "Clips");
      const dataDir = path.join(base, "Data");
      await fsp.mkdir(clipsDir, { recursive: true });
      await fsp.mkdir(dataDir, { recursive: true });
      return { clipsDir, dataDir };
    } catch {
      // A read-only or missing Videos folder is not worth failing a launch over;
      // the app simply carries on with nothing set, exactly as it does today.
      return null;
    }
  });

  // The order to try browsers in when sweeping them all: the system default
  // first, then whichever one last worked, then the rest. Returning the order
  // rather than a single name is what lets the app check them itself instead
  // of making the user pick one at a time from a dropdown.
  ipcMain.handle("system:browserOrder", (_e, saved) => ({
    browsers: browserCheckOrder(
      detectDefaultBrowser(app),
      typeof saved === "string" ? saved : null,
    ),
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
