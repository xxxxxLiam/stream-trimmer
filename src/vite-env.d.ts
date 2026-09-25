/// <reference types="vite/client" />
declare module "*.css";

interface ImportMetaEnv {
  readonly VITE_CHANNEL_PASSCODE_HASH?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Stages the in-app YouTube sign-in reports back to the main window. */
type YouTubeConnectPhase =
  | "waiting"
  | "verifying"
  | "rejected"
  | "verified";

type UpdateStatusPayload =
  | { state: "checking" }
  | { state: "available"; version?: string }
  /**
   * A new version exists but this build cannot restart into it — macOS, where
   * the app is unsigned. `url` is the installer to download.
   */
  | { state: "manual"; version?: string; url: string }
  | { state: "none" }
  | { state: "downloading"; percent: number }
  | { state: "ready"; version?: string }
  | { state: "error"; message: string; url?: string };

interface ElectronAPI {
  isElectron: true;
  settingsSnapshot?: Record<string, unknown>;
  setSetting?: (key: string, value: unknown) => Promise<{ ok: boolean }>;
  pickDirectory: () => Promise<string | null>;
  saveFile: (payload: {
    dirPath: string;
    filename: string;
    data: ArrayBuffer | Uint8Array;
  }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  /**
   * Moves a finished clip from the engine's temp directory to `dirPath`.
   * Only the path crosses the bridge, never the media.
   */
  saveClip?: (payload: {
    tempPath: string;
    dirPath: string;
    filename: string;
  }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  saveFiles: (payload: {
    dirPath: string;
    folder: string;
    files: { name: string; contents: string }[];
  }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  /**
   * Moves the channel exporter's CSVs out of the engine's temp directory into
   * a new subfolder of `dirPath`. Only paths cross the bridge — a whole-channel
   * export is far too large to pass through the renderer.
   */
  saveExport?: (payload: {
    dirPath: string;
    folder: string;
    files: { name: string; path: string }[];
  }) => Promise<{ ok: boolean; path?: string; error?: string }>;
  showInFolder: (
    targetPath: string,
  ) => Promise<{ ok: boolean; error?: string }>;
  fileExists?: (targetPath: string) => Promise<boolean>;
  startDrag?: (targetPath: string) => void;
  /** Opens the in-app YouTube login window. Cookie values never cross this bridge. */
  connectYouTube?: () => Promise<{
    connected: boolean;
    cancelled: boolean;
    error?: string;
  }>;
  /** Refreshes the stored cookie file and reports whether a session exists. */
  probeYouTube?: () => Promise<{ connected: boolean; error?: string }>;
  /** Clears the stored in-app YouTube session. */
  disconnectYouTube?: () => Promise<{ ok: boolean }>;
  /** Picks a cookies.txt exported from the user's own browser and adopts it. */
  importYouTubeCookies?: () => Promise<{
    ok: boolean;
    cancelled?: boolean;
    count?: number;
    error?: string;
  }>;
  /** Subscribes to sign-in progress. Returns an unsubscribe function. */
  onYouTubeProgress?: (
    cb: (payload: { phase: YouTubeConnectPhase }) => void,
  ) => () => void;
  /** Reads the tail of the local diagnostic log, plus its path on disk. */
  readDiagnostics?: () => Promise<{ path: string | null; text: string }>;
  revealDiagnostics?: () => Promise<{
    ok: boolean;
    path?: string;
    error?: string;
  }>;
  copyDiagnostics?: () => Promise<{ ok: boolean; error?: string }>;
  openYouTubeSignIn: () => Promise<{ ok: boolean; error?: string }>;
  getDefaultBrowser?: () => Promise<{
    browser: import("./lib/clip").CookieBrowser | null;
  }>;
  /** Browsers to try, best first, so the app can sweep them itself. */
  getBrowserOrder?: (saved: string | null) => Promise<{
    browsers: import("./lib/clip").CookieBrowser[];
  }>;

  checkForUpdates: () => Promise<{
    ok: boolean;
    version?: string;
    error?: string;
  }>;
  quitAndInstall: () => Promise<{ ok: boolean; error?: string }>;
  onUpdateStatus: (cb: (payload: UpdateStatusPayload) => void) => () => void;
}

interface Window {
  electronAPI?: ElectronAPI;
  __API_BASE__?: string;
}
