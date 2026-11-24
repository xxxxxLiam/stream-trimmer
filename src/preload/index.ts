// src/preload/index.ts — reads the loopback API base URL from the additional
// argument passed by main.ts and exposes it as window.__API_BASE__ before
// any renderer code runs.
import electron from "electron";
const { contextBridge, ipcRenderer } = electron;

const arg = process.argv.find((a) => a.startsWith("--api-base="));
const apiBase = arg ? arg.slice("--api-base=".length) : "";

// A native drag-out may only start inside a real drag gesture. Calling
// webContents.startDrag with no gesture in progress wedges the main process, so
// the bridge refuses unless the browser itself (isTrusted) delivered a
// dragstart a moment ago. Page script can dispatch synthetic events but cannot
// make them trusted, and cannot reach this variable through the bridge.
const DRAG_GESTURE_MS = 1000;
let lastTrustedDragStart = -Infinity;
try {
  window.addEventListener(
    "dragstart",
    (e) => {
      if (e && e.isTrusted) lastTrustedDragStart = Date.now();
    },
    true,
  );
} catch {
  /* no window in this context */
}

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
    setSetting: (key: any, value: any) => ipcRenderer.invoke("settings:set", key, value),
    pickDirectory: () => ipcRenderer.invoke("dialog:pickDirectory"), pickFcpLibrary: () => ipcRenderer.invoke("dialog:pickFcpLibrary"),
    // Ready-made folders for a fresh install; the renderer only asks when the
    // user has not chosen any. Returns null if they could not be created.
    getDefaultFolders: () => ipcRenderer.invoke("system:defaultFolders"),
    saveFile: (payload: any) => ipcRenderer.invoke("file:save", payload),
    // Moves a finished clip out of the engine's temp dir. Only the path
    // crosses the bridge — never the media itself.
    saveClip: (payload: any) => ipcRenderer.invoke("clip:save", payload),
    saveFiles: (payload: any) => ipcRenderer.invoke("file:saveFiles", payload),
    // Moves the channel exporter's CSVs out of the engine's temp dir. Like
    // saveClip, only paths cross the bridge — never the file contents.
    saveExport: (payload: any) => ipcRenderer.invoke("export:save", payload),
    showInFolder: (targetPath: any) =>
      ipcRenderer.invoke("file:showInFolder", targetPath),
    fileExists: (targetPath: any) => ipcRenderer.invoke("file:exists", targetPath),
    // Fire-and-forget send, not invoke: the main process must call startDrag
    // synchronously within the drag gesture.
    startDrag: (targetPath: any) => {
      if (Date.now() - lastTrustedDragStart > DRAG_GESTURE_MS) return;
      ipcRenderer.send("file:startDrag", targetPath);
    },
    // The YouTube session, which is one imported cookies.txt. Cookie values
    // never cross this bridge — the main process writes the file and only
    // yt-dlp reads it, so the renderer sees booleans and a count.
    probeYouTube: () => ipcRenderer.invoke("youtube:probe"),
    disconnectYouTube: () => ipcRenderer.invoke("youtube:disconnect"),
    importYouTubeCookies: () => ipcRenderer.invoke("youtube:importCookies"),
    // A cookies.txt dropped on the window: the renderer reads the text and
    // main validates and commits it.
    importYouTubeCookiesText: (text: any) =>
      ipcRenderer.invoke("youtube:importCookiesText", text),
    // Owner gate. Main hashes the local machine id with the supplied salt and
    // answers with a boolean only; the raw id never crosses the bridge.
    isOwnerMachine: (list: any, salt: any) => ipcRenderer.invoke("owner:check", list, salt),
    // Editor handoff (electron/editorOpen.ts). Paths and small payloads only.
    editor: {
      installed: () => ipcRenderer.invoke("editor:installed"),
      probe: (file: any) => ipcRenderer.invoke("editor:probe", file),
      writeFcpxml: (payload: any) => ipcRenderer.invoke("editor:writeFcpxml", payload),
      openWith: (payload: any) => ipcRenderer.invoke("editor:openWith", payload),
      reveal: (target: any) => ipcRenderer.invoke("editor:reveal", target),
      copyFiles: (payload: any) => ipcRenderer.invoke("editor:copyFiles", payload),
      pathExists: (target: any) => ipcRenderer.invoke("editor:pathExists", target),
    },
    // Diagnostics: reads the app's own local log so a crash can be reported.
    readDiagnostics: () => ipcRenderer.invoke("diagnostics:read"),
    revealDiagnostics: () => ipcRenderer.invoke("diagnostics:reveal"),
    copyDiagnostics: () => ipcRenderer.invoke("diagnostics:copy"),
    // Secondary route: opens YouTube in the user's own browser, so yt-dlp can
    // be pointed at that browser's cookie store instead of an imported file.
    openYouTubeSignIn: () => ipcRenderer.invoke("shell:openYouTubeSignIn"),
    getDefaultBrowser: () => ipcRenderer.invoke("system:defaultBrowser"),
    getBrowserOrder: (saved: any) => ipcRenderer.invoke("system:browserOrder", saved),

    checkForUpdates: () => ipcRenderer.invoke("updater:check"),
    quitAndInstall: () => ipcRenderer.invoke("updater:quitAndInstall"),
    onUpdateStatus: (cb: any) => {
      const listener = (_e: any, payload: any) => cb(payload);
      ipcRenderer.on("updater:status", listener);
      return () => ipcRenderer.removeListener("updater:status", listener);
    },
  });
} catch {
  // contextBridge unavailable in some contexts — fall back to a direct set.
  // eslint-disable-next-line no-undef
  (window as unknown as { __API_BASE__?: string }).__API_BASE__ = apiBase;
}
