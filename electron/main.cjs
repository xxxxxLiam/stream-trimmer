// electron/main.cjs — Electron main process. Starts one in-process Express
// backend on a free port, loads the built front-end, and shuts everything
// down cleanly on quit. No dev server ships; this file is CommonJS because
// the project's package.json sets "type": "module".
const { app, BrowserWindow, shell } = require("electron");
const path = require("node:path");
const net = require("node:net");
const fs = require("node:fs");

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