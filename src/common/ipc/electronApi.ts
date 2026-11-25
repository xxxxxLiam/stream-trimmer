/**
 * File: electronApi.ts
 * Path: src/common/ipc/electronApi.ts
 * Description: The shape of the bridge the preload exposes as window.electronAPI.
 * Shared by the preload (which builds it) and the renderer (which calls it), so it
 * lives in common rather than as an ambient renderer type.
 */
import type { CookieBrowser } from "../constants/cookieBrowsers";
import type { FcpLookFileResult } from "../types/fcpLook";
import type { CookieCheck, SignInSignal } from "../types/signIn";
import type { RestartToUpdateResult, UpdateReady } from "../types/updates";

export type UpdateStatusPayload =
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

export interface ElectronAPI {
  isElectron: true;
  settingsSnapshot?: Record<string, unknown>;
  setSetting?: (key: string, value: unknown) => Promise<{ ok: boolean }>;
  pickDirectory: () => Promise<string | null>; pickFcpLibrary?: () => Promise<string | null>;
  /** Folders to fall back to on a fresh install; null if they could not be made. */
  getDefaultFolders?: () => Promise<{ clipsDir: string; dataDir: string } | null>;
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
  /**
   * Undo of a just-made clip: moves its file to the Trash / Recycle Bin. Refuses anything outside
   * the user's clip folders; a file that's already gone is ok.
   */
  undoClip?: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  fileExists?: (targetPath: string) => Promise<boolean>;
  startDrag?: (targetPath: string) => void;
  /** Reads the stored cookies.txt and reports whether a session is on disk. */
  probeYouTube?: () => Promise<{
    connected: boolean;
    error?: string;
    /** Epoch ms when the sign-in lapses, if the file says. */
    expiresAt?: number | null;
    expired?: boolean;
  }>;
  /** Deletes the stored cookies.txt. */
  disconnectYouTube?: () => Promise<{ ok: boolean }>;
  /** Picks a cookies.txt exported from the user's own browser and adopts it. */
  importYouTubeCookies?: () => Promise<{
    ok: boolean;
    cancelled?: boolean;
    count?: number;
    error?: string;
  }>;
  /** Adopts cookies.txt text (a file dropped on the window). Validated in main. */
  importYouTubeCookiesText?: (text: string) => Promise<CookieCheck & { error?: string }>;
  /**
   * True when this computer's salted id is in `list`. Only a boolean crosses
   * the bridge; the raw machine id stays in the main process.
   */
  isOwnerMachine?: (list: string[], salt: string) => Promise<boolean>;
  /**
   * Suggested clip names, offline. `prepare` builds the phrase table once when a transcript loads;
   * `suggest` names a range (or several, for a joined clip). `skip` walks down the list for refresh.
   * With no transcript prepared, the name is the video title plus a number.
   */
  clipNames?: {
    prepare: (payload: {
      videoId: string;
      lines: { start: number; end: number; text: string }[];
    }) => Promise<{ ok: boolean; error?: string }>;
    suggest: (payload: {
      videoId: string;
      ranges: { start: number; end: number }[];
      videoTitle: string;
      existing: string[];
      skip?: number;
    }) => Promise<{ ok: boolean; name?: string; error?: string }>;
  };
  /**
   * Editor handoff, implemented in electron/editorOpen.ts. Every call
   * resolves; failures are { ok: false, error } in plain words.
   */
  editor?: {
    installed: () => Promise<{
      ok: boolean;
      apps?: { finalcut: boolean; premiere: boolean; resolve: boolean; capcut: boolean };
      /** Editors this system offers at all; Final Cut is not listed on Windows. */
      offered?: string[];
      error?: string;
    }>;
    probe: (file: string) => Promise<{ ok: boolean; error?: string; [k: string]: unknown }>;
    writeFcpxml: (payload: {
      dirPath: string;
      filename: string;
      contents: string;
    }) => Promise<{ ok: boolean; path?: string; error?: string }>;
    openWith: (payload: {
      app: "finalcut" | "premiere" | "resolve" | "capcut";
      file?: string;
    }) => Promise<{ ok: boolean; appPath?: string; missing?: string; opened?: boolean; revealed?: boolean; shown?: boolean; error?: string }>;
    reveal: (target: string) => Promise<{ ok: boolean; error?: string }>;
    copyFiles: (payload: {
      dirPath: string;
      files: unknown[];
    }) => Promise<{ ok: boolean; error?: string; [k: string]: unknown }>;
    /**
     * Checked before an import names a Final Cut library. Final Cut creates a
     * library when nothing exists at the URL it is handed, so without this a
     * mistyped path would quietly produce a stray library instead of failing.
     */
    pathExists: (
      target: string,
    ) => Promise<{ ok: boolean; exists?: boolean; isDirectory?: boolean; error?: string }>;
  };
  /** Reads the tail of the local diagnostic log, plus its path on disk. */
  /** ISO time when this launch restored the settings from the backup copy, else null. */
  settingsRestoredAt?: () => Promise<string | null>;
  readDiagnostics?: () => Promise<{ path: string | null; text: string }>;
  revealDiagnostics?: () => Promise<{
    ok: boolean;
    path?: string;
    error?: string;
  }>;
  copyDiagnostics?: () => Promise<{ ok: boolean; error?: string }>;
  openYouTubeSignIn: () => Promise<{ ok: boolean; error?: string }>;
  getDefaultBrowser?: () => Promise<{
    browser: CookieBrowser | null;
  }>;
  /** Browsers to try, best first, so the app can sweep them itself. */
  getBrowserOrder?: (saved: string | null) => Promise<{
    browsers: CookieBrowser[];
  }>;

  /** Opens the native picker for the user's Final Cut export and returns the parsed look, or a plain reason. */
  pickFinalCutLook: () => Promise<FcpLookFileResult>;
  /** The same reader for a file or .fcpxmld bundle dropped on the window. */
  readFinalCutLook: (file: File) => Promise<FcpLookFileResult>;
  /** The footer's "at 360p" and "Sign in for 1080p" pill read this. */
  getSignInSignal: () => Promise<SignInSignal>;
  onSignInSignal: (cb: (signal: SignInSignal) => void) => () => void;
  /** The silent browser sweep's result: true when one browser's YouTube sign-in was usable. */
  reportBrowserSignIn: (usable: boolean) => Promise<{ ok: boolean }>;
  /** Opens the small always-on-top Symbols and phrases window (one instance). Esc closes it. */
  openSymbols: () => Promise<{ ok: boolean }>;
  checkForUpdates: () => Promise<{
    ok: boolean;
    version?: string;
    error?: string;
  }>;
  /** Restarts into the downloaded update; refuses with reason "busy" while a clip is being made. */
  restartToUpdate: () => Promise<RestartToUpdateResult>;
  /** An update that is ready right now (for a window that opened after the event). */
  getUpdateReady: () => Promise<UpdateReady | null>;
  /** One event when a version is ready: restart (Windows, Linux) or download (unsigned Mac). */
  onUpdateReady: (cb: (payload: UpdateReady) => void) => () => void;
  onUpdateStatus: (cb: (payload: UpdateStatusPayload) => void) => () => void;
}
