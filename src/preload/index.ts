// src/preload/index.ts — reads the loopback API base URL from the additional
// argument passed by main.ts and exposes it as window.__API_BASE__ before
// any renderer code runs.
import { IPC } from "../common/ipc/channels";
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
        return ipcRenderer.sendSync(IPC.settingsAll) || {};
      } catch {
        return {};
      }
    })(),
    setSetting: (key: unknown, value: unknown) => ipcRenderer.invoke(IPC.settingsSet, key, value),
    pickDirectory: () => ipcRenderer.invoke(IPC.dialogPickDirectory), pickFcpLibrary: () => ipcRenderer.invoke(IPC.dialogPickFcpLibrary),
    // Ready-made folders for a fresh install; the renderer only asks when the
    // user has not chosen any. Returns null if they could not be created.
    getDefaultFolders: () => ipcRenderer.invoke(IPC.systemDefaultFolders),
    saveFile: (payload: unknown) => ipcRenderer.invoke(IPC.fileSave, payload),
    // Moves a finished clip out of the engine's temp dir. Only the path
    // crosses the bridge — never the media itself.
    saveClip: (payload: unknown) => ipcRenderer.invoke(IPC.clipSave, payload),
    saveFiles: (payload: unknown) => ipcRenderer.invoke(IPC.fileSaveFiles, payload),
    // Moves the channel exporter's CSVs out of the engine's temp dir. Like
    // saveClip, only paths cross the bridge — never the file contents.
    saveExport: (payload: unknown) => ipcRenderer.invoke(IPC.exportSave, payload),
    showInFolder: (targetPath: unknown) =>
      ipcRenderer.invoke(IPC.fileShowInFolder, targetPath),
    fileExists: (targetPath: unknown) => ipcRenderer.invoke(IPC.fileExists, targetPath),
    // Fire-and-forget send, not invoke: the main process must call startDrag
    // synchronously within the drag gesture.
    startDrag: (targetPath: unknown) => {
      if (Date.now() - lastTrustedDragStart > DRAG_GESTURE_MS) return;
      ipcRenderer.send(IPC.fileStartDrag, targetPath);
    },
    // The YouTube session, which is one imported cookies.txt. Cookie values
    // never cross this bridge — the main process writes the file and only
    // yt-dlp reads it, so the renderer sees booleans and a count.
    probeYouTube: () => ipcRenderer.invoke(IPC.youtubeProbe),
    disconnectYouTube: () => ipcRenderer.invoke(IPC.youtubeDisconnect),
    importYouTubeCookies: () => ipcRenderer.invoke(IPC.youtubeImportCookies),
    // A cookies.txt dropped on the window: the renderer reads the text and
    // main validates and commits it.
    importYouTubeCookiesText: (text: unknown) =>
      ipcRenderer.invoke(IPC.youtubeImportCookiesText, text),
    // Owner gate. Main hashes the local machine id with the supplied salt and
    // answers with a boolean only; the raw id never crosses the bridge.
    isOwnerMachine: (list: unknown, salt: unknown) => ipcRenderer.invoke(IPC.ownerCheck, list, salt),
    // Editor handoff (electron/editorOpen.ts). Paths and small payloads only.
    editor: {
      installed: () => ipcRenderer.invoke(IPC.editorInstalled),
      probe: (file: unknown) => ipcRenderer.invoke(IPC.editorProbe, file),
      writeFcpxml: (payload: unknown) => ipcRenderer.invoke(IPC.editorWriteFcpxml, payload),
      openWith: (payload: unknown) => ipcRenderer.invoke(IPC.editorOpenWith, payload),
      reveal: (target: unknown) => ipcRenderer.invoke(IPC.editorReveal, target),
      copyFiles: (payload: unknown) => ipcRenderer.invoke(IPC.editorCopyFiles, payload),
      pathExists: (target: unknown) => ipcRenderer.invoke(IPC.editorPathExists, target),
    },
    // Diagnostics: reads the app's own local log so a crash can be reported.
    readDiagnostics: () => ipcRenderer.invoke(IPC.diagnosticsRead),
    revealDiagnostics: () => ipcRenderer.invoke(IPC.diagnosticsReveal),
    copyDiagnostics: () => ipcRenderer.invoke(IPC.diagnosticsCopy),
    // Secondary route: opens YouTube in the user's own browser, so yt-dlp can
    // be pointed at that browser's cookie store instead of an imported file.
    openYouTubeSignIn: () => ipcRenderer.invoke(IPC.shellOpenYouTubeSignIn),
    getDefaultBrowser: () => ipcRenderer.invoke(IPC.systemDefaultBrowser),
    getBrowserOrder: (saved: unknown) => ipcRenderer.invoke(IPC.systemBrowserOrder, saved),

    checkForUpdates: () => ipcRenderer.invoke(IPC.updaterCheck),
    quitAndInstall: () => ipcRenderer.invoke(IPC.updaterQuitAndInstall),
    onUpdateStatus: (cb: (payload: unknown) => void) => {
      const listener = (_e: unknown, payload: unknown) => cb(payload);
      ipcRenderer.on(IPC.updaterStatus, listener);
      return () => ipcRenderer.removeListener(IPC.updaterStatus, listener);
    },
  });
} catch {
  // contextBridge unavailable in some contexts — fall back to a direct set.
  // eslint-disable-next-line no-undef
  (window as unknown as { __API_BASE__?: string }).__API_BASE__ = apiBase;
}
