/**
 * File: electronApi.ts
 * Path: src/common/ipc/electronApi.ts
 * Description: The shape of the bridge the preload exposes as window.electronAPI.
 * Shared by the preload (which builds it) and the renderer (which calls it), so it
 * lives in common rather than as an ambient renderer type.
 */
import type { CookieBrowser } from "../constants/cookieBrowsers";
import type { FcpLookFileResult } from "../types/fcpLook";
import type { CookieCheck, ImportVerified, SignInSignal } from "../types/signIn";
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

/** Why a save failed: the disk is full, the folder can't be written, the folder is gone, or something else. */
export type SaveFailureCode =
  | "DISK_FULL"
  | "FOLDER_NOT_WRITABLE"
  | "FOLDER_GONE"
  | "FILE_NAME_INVALID"
  | "NOTHING_TO_SAVE"
  | "SAVE_FAILED";

export interface ElectronAPI {
  isElectron: true;
  settingsSnapshot?: Record<string, unknown>;
  /** `reason` says why a write was refused: too large, a key the page may not write, or the disk write failed. */
  setSetting?: (key: string, value: unknown) => Promise<{ ok: boolean; reason?: "too-large" | "not-allowed" | "write-failed" }>;
  /** Save a clip list as a .txt the person places in the native save dialog. */
  saveTextFile?: (payload: { name: string; text: string }) => Promise<{ ok: boolean; path?: string; cancelled?: boolean; error?: string }>;
  /** Pick a folder and get back where this campaign or location saves: <picked>/Clipr clips/<Campaign> or <picked>/Clipr <Name>. Null if cancelled. */
  pickBrandedDirectory?: (payload: { kind: "campaign" | "location"; name: string }) => Promise<{ chosen: string; dir: string } | null>;
  pickDirectory: () => Promise<string | null>; pickFcpLibrary?: () => Promise<string | null>;
  /** "Add to Final Cut": picks a library fresh every call, starting in the folder last used. */
  pickAssetsLibrary?: () => Promise<string | null>;
  /** Folders to fall back to on a fresh install; null if they could not be made. */
  getDefaultFolders?: () => Promise<{ clipsDir: string; dataDir: string } | null>;
  saveFile: (payload: {
    dirPath: string;
    filename: string;
    data: ArrayBuffer | Uint8Array;
  }) => Promise<{ ok: boolean; path?: string; fileName?: string; error?: string; code?: SaveFailureCode }>;
  /**
   * Moves a finished clip from the engine's temp directory to `dirPath`.
   * Only the path crosses the bridge, never the media.
   */
  saveClip?: (payload: {
    tempPath: string;
    dirPath: string;
    filename: string;
  }) => Promise<{ ok: boolean; path?: string; fileName?: string; error?: string; code?: SaveFailureCode }>;
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
  ) => Promise<{ ok: boolean; error?: string; /** The path does not exist (yet): a folder is made with the first clip. */ missing?: boolean }>;
  /**
   * Undo of a just-made clip: moves its file to the Trash / Recycle Bin. Refuses anything outside
   * the user's clip folders; a file that's already gone is ok.
   */
  undoClip?: (targetPath: string) => Promise<{ ok: boolean; error?: string }>;
  fileExists?: (targetPath: string) => Promise<boolean>;
  /**
   * Before a clip starts: does the folder it will land in (and the work folder, if tighter) have room? `ok` is false
   * only when clearly short; `freeMb` is null when it can't be read (never a reason to warn). Same estimate as the
   * engine's out-of-space sentence.
   */
  checkFreeSpace?: (payload: {
    dirPath: string;
    seconds: number;
    quality: string | number;
    audio?: boolean;
    segments?: number;
  }) => Promise<{ ok: boolean; neededMb: number; freeMb: number | null }>;
  /**
   * Can Clipr write into this folder? `gone` is a missing folder or an unmounted drive; `refused` is a folder that is
   * there but will not take a file (no permission, read-only). Run it when Clip is pressed and before a save.
   */
  checkFolder?: (payload: { dirPath: string }) => Promise<{ ok: true } | { ok: false; problem: "gone" | "refused" | "blocked" }>;
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
  } & Partial<ImportVerified>>;
  /** Adopts cookies.txt text (a file dropped on the window). Validated in main. */
  importYouTubeCookiesText?: (text: string) => Promise<CookieCheck & { error?: string } & Partial<ImportVerified>>;
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
    /** Of `files`, which are new to this "Add to Final Cut" library (not already added on an earlier call). */
    assetsLibraryAdded: (payload: { library: string; files: string[] }) => Promise<{ ok: boolean; newFiles?: string[]; error?: string }>;
    /** Records `files` as now added to this library, so a later call skips them. */
    recordAssetsLibraryAdded: (payload: { library: string; files: string[] }) => Promise<{ ok: boolean; error?: string }>;
  };
  /** Reads the tail of the local diagnostic log, plus its path on disk. */
  /**
   * Sends a crash report (kind "crash": the error) or a Report a problem note (kind "problem": note and error) through the
   * report relay. main adds the app and system version and the cleaned log. "kept" means it is waiting for a later launch.
   */
  sendReport?: (payload: { kind: "crash" | "problem"; note?: string; error: string }) => Promise<{ ok: boolean; status?: "sent" | "kept" }>;
  /** ISO time when this launch restored the settings from the backup copy, else null. */
  settingsRestoredAt?: () => Promise<string | null>;
  /** True on the first launch after updating from an earlier version (and until answered). Never on a fresh install. */
  startFreshPending?: () => Promise<boolean>;
  /**
   * "fresh": backs campaigns, bank, history and settings up to Documents/Clipr backups/<date>, clears them and records the answer;
   * the page then reloads into the cold start. "keep": changes nothing. A failed backup clears nothing and answers ok:false with a sentence.
   */
  startFreshAnswer?: (choice: "fresh" | "keep") => Promise<{ ok: true; backupDir?: string } | { ok: false; error: string }>;
  /** Why this launch started with nothing although the person had data: "unreadable" or "missing". Null when nothing was lost. */
  settingsLost?: () => Promise<"unreadable" | "missing" | null>;
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
  /**
   * The main window's frame: whether the top bar carries the macOS traffic lights (macInset) or the
   * Windows minimise, maximise and close buttons (winOverlay), and whether the window is full screen.
   */
  getWindowChrome: () => Promise<{ macInset: boolean; winOverlay: boolean; fullScreen: boolean }>;
  /** Fires with true or false when the window enters or leaves full screen. */
  onFullScreen: (cb: (fullScreen: boolean) => void) => () => void;
  /** Opens the small always-on-top Symbols and phrases window (one instance). Esc closes it. */
  openSymbols: () => Promise<{ ok: boolean }>;
  checkForUpdates: () => Promise<{
    ok: boolean;
    version?: string;
    error?: string;
  }>;
  /**
   * Restarts into the downloaded update. While a clip is being made it answers `{ ok: true, waiting: true }` and
   * Clipr restarts by itself once the clips finish (the pill reads "Restarts after <video>").
   */
  restartToUpdate: () => Promise<RestartToUpdateResult>;
  /** Ends a waiting restart (pressing the pill again). `cancelled` is false when nothing was waiting. */
  cancelRestartToUpdate?: () => Promise<{ ok: true; cancelled: boolean }>;
  /** Whether a restart is waiting right now (for a window that opened after the event). */
  getRestartWaiting?: () => Promise<boolean>;
  /** Fires true when a restart starts waiting, false when the wait ends (cancelled, or Clipr is restarting). */
  onRestartWaiting?: (cb: (waiting: boolean) => void) => () => void;
  /** An update that is ready right now (for a window that opened after the event). */
  getUpdateReady: () => Promise<UpdateReady | null>;
  /** One event when a version is ready: restart (Windows, Linux) or download (unsigned Mac). */
  onUpdateReady: (cb: (payload: UpdateReady) => void) => () => void;
  onUpdateStatus: (cb: (payload: UpdateStatusPayload) => void) => () => void;
}
