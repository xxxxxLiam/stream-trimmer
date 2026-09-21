// electron/preload.cjs — reads the loopback API base URL from the additional
// argument passed by main.cjs and exposes it as window.__API_BASE__ before
// any renderer code runs.
const { contextBridge, ipcRenderer } = require("electron");

const arg = process.argv.find((a) => a.startsWith("--api-base="));
const apiBase = arg ? arg.slice("--api-base=".length) : "";

try {
  contextBridge.exposeInMainWorld("__API_BASE__", apiBase);
  contextBridge.exposeInMainWorld("electronAPI", {
    isElectron: true,
    settingsSnapshot: (() => {
      try {
        return ipcRenderer.sendSync("settings:all") || {};
      } catch {
        return {};
      }
    })(),
    setSetting: (key, value) => ipcRenderer.invoke("settings:set", key, value),
    pickDirectory: () => ipcRenderer.invoke("dialog:pickDirectory"),
    saveFile: (payload) => ipcRenderer.invoke("file:save", payload),
    // Moves a finished clip out of the engine's temp dir. Only the path
    // crosses the bridge — never the media itself.
    saveClip: (payload) => ipcRenderer.invoke("clip:save", payload),
    saveFiles: (payload) => ipcRenderer.invoke("file:saveFiles", payload),
    showInFolder: (targetPath) =>
      ipcRenderer.invoke("file:showInFolder", targetPath),
    fileExists: (targetPath) => ipcRenderer.invoke("file:exists", targetPath),
    // Fire-and-forget send, not invoke: the main process must call startDrag
    // synchronously within the drag gesture.
    startDrag: (targetPath) => ipcRenderer.send("file:startDrag", targetPath),
    // In-app YouTube sign-in. Cookie values never cross this bridge — the
    // main process keeps them in its own session and writes them to a file
    // only yt-dlp reads.
    connectYouTube: () => ipcRenderer.invoke("youtube:connect"),
    probeYouTube: () => ipcRenderer.invoke("youtube:probe"),
    disconnectYouTube: () => ipcRenderer.invoke("youtube:disconnect"),
    // Adopts a cookies.txt the user exported from their own browser.
    importYouTubeCookies: () => ipcRenderer.invoke("youtube:importCookies"),
    // Coarse sign-in progress, so the main window can show which stage the
    // flow is in instead of one indefinite spinner.
    onYouTubeProgress: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on("youtube:progress", listener);
      return () => ipcRenderer.removeListener("youtube:progress", listener);
    },
    // Fallback path: opens YouTube in the user's own browser so yt-dlp can
    // read that browser's cookie store instead.
    // Diagnostics: reads the app's own local log so a crash can be reported.
    readDiagnostics: () => ipcRenderer.invoke("diagnostics:read"),
    revealDiagnostics: () => ipcRenderer.invoke("diagnostics:reveal"),
    copyDiagnostics: () => ipcRenderer.invoke("diagnostics:copy"),
    openYouTubeSignIn: () => ipcRenderer.invoke("shell:openYouTubeSignIn"),
    getDefaultBrowser: () => ipcRenderer.invoke("system:defaultBrowser"),

    checkForUpdates: () => ipcRenderer.invoke("updater:check"),
    quitAndInstall: () => ipcRenderer.invoke("updater:quitAndInstall"),
    onUpdateStatus: (cb) => {
      const listener = (_e, payload) => cb(payload);
      ipcRenderer.on("updater:status", listener);
      return () => ipcRenderer.removeListener("updater:status", listener);
    },
  });
} catch {
  // contextBridge unavailable in some contexts — fall back to a direct set.
  // eslint-disable-next-line no-undef
  window.__API_BASE__ = apiBase;
}
