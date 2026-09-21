/**
 * File: youtubeConnection.ts
 * Path: src/lib/youtubeConnection.ts
 * Description: App-wide YouTube connection. Primary path is the session the
 * user signs into inside the app (persisted by the main process); reading a
 * desktop browser's cookie store is kept only as a fallback.
 */
import { useSyncExternalStore } from "react";
import {
  COOKIE_BROWSERS,
  apiUrl,
  parseJson,
  type AuthSource,
  type CookieBrowser,
  type YouTubeAuthState,
} from "./clip";
import { readSetting, writeSetting } from "./persist";

const SOURCE_KEY = "clipper.authSource";
const BROWSER_KEY = "clipper.cookieBrowser";

export interface YouTubeConnectionState {
  connected: boolean;
  /** Which session the app is currently using. */
  source: AuthSource;
  /** Browser selected for the fallback path (independent of `source`). */
  browser: CookieBrowser;
  browserStatus: YouTubeAuthState;
  busy: boolean;
  step?: string;
  message?: string;
  /** Raw yt-dlp output tail from the last failed check, when there is one. */
  reason?: string;
  /** True once a real check (or restore) has finished at least once. */
  probed: boolean;
  /** True while the launch-time silent restore is still running. */
  restoring: boolean;
  /** Whether the in-app sign-in window is available (desktop build only). */
  canSignInApp: boolean;
  /** Current stage of an in-app sign-in, while one is running. */
  phase?: YouTubeConnectPhase;
  /** Epoch ms the current verification started, for an elapsed-time readout. */
  verifyStartedAt?: number;
}

/** Human-readable label for each sign-in stage. */
export const PHASE_LABEL: Record<YouTubeConnectPhase, string> = {
  waiting: "Waiting for you to sign in…",
  verifying: "Checking your sign-in with YouTube…",
  rejected: "YouTube didn't accept that sign-in. Try again in the window.",
  verified: "Signed in — finishing up…",
};

export interface CookiePayload {
  cookiesFromBrowser?: AuthSource;
}

function isCookieBrowser(value: unknown): value is CookieBrowser {
  return typeof value === "string" && COOKIE_BROWSERS.includes(value as CookieBrowser);
}

function electron() {
  return typeof window === "undefined" ? undefined : window.electronAPI;
}

function hasInAppSignIn(): boolean {
  const api = electron();
  return Boolean(api?.connectYouTube && api?.probeYouTube);
}

function initialBrowser(): CookieBrowser {
  const saved = readSetting<string>(BROWSER_KEY, "chrome");
  return isCookieBrowser(saved) ? saved : "chrome";
}

function initialSource(): AuthSource {
  const saved = readSetting<string>(SOURCE_KEY, "");
  // A saved "app" source is meaningless without the desktop bridge (browser
  // preview, or an older build), so fall back to the browser path there.
  if (saved === "app") return hasInAppSignIn() ? "app" : initialBrowser();
  if (isCookieBrowser(saved)) return saved;
  return hasInAppSignIn() ? "app" : initialBrowser();
}

let state: YouTubeConnectionState = {
  connected: false,
  source: initialSource(),
  browser: initialBrowser(),
  browserStatus: "idle",
  busy: false,
  probed: false,
  restoring: hasInAppSignIn(),
  canSignInApp: hasInAppSignIn(),
};

const listeners = new Set<() => void>();
let activeCheck: Promise<boolean> | null = null;

// Sign-in progress arrives from the main process; without it the UI has no
// way to tell "waiting for the user" apart from "verifying with YouTube",
// which is the slow stage.
electron()?.onYouTubeProgress?.(({ phase }) => {
  set({
    phase,
    step: PHASE_LABEL[phase] ?? undefined,
    verifyStartedAt: phase === "verifying" ? Date.now() : undefined,
  });
});

function set(patch: Partial<YouTubeConnectionState>) {
  state = { ...state, ...patch };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function snapshot() {
  return state;
}

export function useYouTubeConnection(): YouTubeConnectionState {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function isConnected(): boolean {
  return state.connected;
}

export function cookiePayload(): CookiePayload {
  return state.connected ? { cookiesFromBrowser: state.source } : {};
}

export function markDisconnected(message?: string): void {
  set({
    connected: false,
    browserStatus: "signed_out",
    message,
    probed: true,
    restoring: false,
  });
}

async function defaultBrowser(): Promise<CookieBrowser | null> {
  const api = electron();
  if (!api?.getDefaultBrowser) return null;
  try {
    const result = await api.getDefaultBrowser();
    return isCookieBrowser(result.browser) ? result.browser : null;
  } catch {
    return null;
  }
}

interface ProbeResult {
  status: YouTubeAuthState;
  message?: string;
  reason?: string;
}

/** Asks the local engine whether yt-dlp is accepted by YouTube with `source`. */
async function checkSource(source: AuthSource): Promise<ProbeResult> {
  try {
    const response = await fetch(apiUrl("/api/auth/youtube/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browser: source }),
    });
    const data = await parseJson<ProbeResult>(response);
    return {
      status: data.status ?? "extractor_error",
      message: data.message,
      reason: data.reason,
    };
  } catch {
    return {
      status: "extractor_error",
      message: "Couldn't reach the local engine.",
    };
  }
}

function failureMessage(result: ProbeResult, source: AuthSource): string {
  if (result.message) return result.message;
  if (source === "app") return "Your saved YouTube sign-in is no longer valid.";
  return "No signed-in YouTube session was found in that browser. Sign in there, leave the tab open, then check again.";
}

function markConnected(source: AuthSource) {
  writeSetting(SOURCE_KEY, source);
  set({
    phase: undefined,
    verifyStartedAt: undefined,
    connected: true,
    source,
    browserStatus: "signed_in",
    busy: false,
    step: undefined,
    message: undefined,
    reason: undefined,
    probed: true,
    restoring: false,
  });
}

function markFailed(result: ProbeResult, source: AuthSource) {
  set({
    phase: undefined,
    verifyStartedAt: undefined,
    connected: false,
    source,
    browserStatus: result.status,
    busy: false,
    step: undefined,
    message: failureMessage(result, source),
    reason: result.reason,
    probed: true,
    restoring: false,
  });
}

/**
 * Launch-time restore. Refreshes the cookie file from the app's own session,
 * then verifies it once. On success the app opens straight into the main UI
 * with no prompt. Never runs on a timer.
 */
export async function restoreConnection(): Promise<boolean> {
  const api = electron();
  if (!api?.probeYouTube) {
    set({ restoring: false });
    // Browser build (or an older desktop build): only pre-select a browser.
    await initBrowserSelection();
    return false;
  }
  set({ restoring: true, busy: true, step: "Restoring your YouTube sign-in…" });
  try {
    const stored = await api.probeYouTube();
    if (!stored.connected) {
      set({
        connected: false,
        busy: false,
        step: undefined,
        restoring: false,
        probed: true,
        browserStatus: "idle",
        message: undefined,
      });
      await initBrowserSelection();
      return false;
    }
    const result = await checkSource("app");
    if (result.status === "signed_in") {
      markConnected("app");
      return true;
    }
    markFailed(result, "app");
    return false;
  } catch {
    set({ busy: false, step: undefined, restoring: false, probed: true });
    return false;
  }
}

/**
 * The guaranteed path: opens a real YouTube login window inside the app, in
 * its own persistent session, and verifies the result for real before
 * reporting success.
 */
export async function connectInApp(): Promise<boolean> {
  const api = electron();
  if (!api?.connectYouTube) {
    set({ message: "In-app sign-in needs the desktop app." });
    return false;
  }
  set({
    busy: true,
    phase: "waiting",
    step: PHASE_LABEL.waiting,
    verifyStartedAt: undefined,
    message: undefined,
    reason: undefined,
  });
  try {
    const result = await api.connectYouTube();
    if (!result.connected) {
      set({
        busy: false,
        phase: undefined,
        step: undefined,
        verifyStartedAt: undefined,
        probed: true,
        restoring: false,
        message: result.cancelled
          ? undefined
          : result.error || "Sign-in didn't complete. Try again.",
      });
      return false;
    }
    // No second check here. `connected` already means the main process ran
    // the engine's real verification against YouTube through the very same
    // endpoint — re-running it doubled the slowest part of the flow for no
    // extra confidence.
    markConnected("app");
    return true;
  } catch (error) {
    set({
      busy: false,
      phase: undefined,
      step: undefined,
      verifyStartedAt: undefined,
      probed: true,
      restoring: false,
      message: error instanceof Error ? error.message : "Sign-in failed.",
    });
    return false;
  }
}

/**
 * Adopts a cookies.txt the user exported from their own browser, then
 * verifies it. This is the path that works when the others cannot: Google
 * refuses sign-in from inside an app, and on Windows a running Chrome locks
 * its cookie database while App-Bound Encryption stops anything else
 * decrypting a copy.
 */
export async function importCookies(): Promise<boolean> {
  const api = electron();
  if (!api?.importYouTubeCookies) {
    set({ message: "Importing cookies needs the desktop app." });
    return false;
  }
  set({ busy: true, step: "Reading the cookies file…", message: undefined, reason: undefined });
  try {
    const result = await api.importYouTubeCookies();
    if (result.cancelled) {
      set({ busy: false, step: undefined });
      return false;
    }
    if (!result.ok) {
      set({
        busy: false,
        step: undefined,
        probed: true,
        message: result.error || "That file couldn't be used.",
      });
      return false;
    }
    set({ phase: "verifying", step: PHASE_LABEL.verifying, verifyStartedAt: Date.now() });
    const verified = await checkSource("app");
    if (verified.status === "signed_in") {
      markConnected("app");
      return true;
    }
    markFailed(verified, "app");
    return false;
  } catch (error) {
    set({
      busy: false,
      step: undefined,
      probed: true,
      message: error instanceof Error ? error.message : "Import failed.",
    });
    return false;
  }
}

/** Clears the stored in-app session so the next launch asks again. */
export async function signOut(): Promise<void> {
  const api = electron();
  try {
    await api?.disconnectYouTube?.();
  } catch {
    /* clearing is best effort — the state below is what gates the UI */
  }
  writeSetting(SOURCE_KEY, null);
  set({
    connected: false,
    phase: undefined,
    verifyStartedAt: undefined,
    source: hasInAppSignIn() ? "app" : state.browser,
    browserStatus: "idle",
    busy: false,
    step: undefined,
    message: undefined,
    reason: undefined,
    probed: true,
    restoring: false,
  });
}

/** Selects the browser used by the fallback path, without starting a check. */
export function selectBrowser(browser: CookieBrowser): void {
  writeSetting(BROWSER_KEY, browser);
  set({ browser, message: undefined, reason: undefined });
}

/** Detects the system default browser once, for the initial dropdown value. */
export async function initBrowserSelection(): Promise<void> {
  if (readSetting<string>(BROWSER_KEY, "")) return;
  const detected = await defaultBrowser();
  if (detected) selectBrowser(detected);
}

async function runConnectionCheck(source: AuthSource): Promise<boolean> {
  set({
    busy: true,
    step: source === "app" ? "Checking your saved sign-in…" : `Checking ${source}…`,
    browserStatus: "checking",
    message: undefined,
    reason: undefined,
  });
  // Roll the cookie file forward from the app's own session before checking,
  // so a session that is still alive never reads as expired.
  if (source === "app") {
    try {
      await electron()?.probeYouTube?.();
    } catch {
      /* the check below reports the real outcome */
    }
  }
  const result = await checkSource(source);
  if (result.status === "signed_in") {
    markConnected(source);
    return true;
  }
  markFailed(result, source);
  return false;
}

/** Runs at most one check at a time. */
export function checkConnection(source?: AuthSource): Promise<boolean> {
  if (activeCheck) return activeCheck;
  activeCheck = runConnectionCheck(source ?? state.source).finally(() => {
    activeCheck = null;
  });
  return activeCheck;
}

/**
 * Tries every installed browser, best first, and stops at the first one with
 * a usable YouTube session.
 *
 * Without this the user has to guess: pick a browser from a dropdown, press
 * check, read a failure, pick another. A Windows diagnostic report showed
 * someone doing exactly that fifteen times across four browsers before
 * giving up. The app knows the list — it should do the looking.
 */
export async function sweepBrowsers(): Promise<boolean> {
  const api = electron();
  let order: CookieBrowser[] = [...COOKIE_BROWSERS];
  try {
    const result = await api?.getBrowserOrder?.(
      readSetting<string>(BROWSER_KEY, "") || null,
    );
    if (result?.browsers?.length) order = result.browsers;
  } catch {
    /* fall back to the full list in its default order */
  }

  const failures: string[] = [];
  for (const browser of order) {
    set({
      busy: true,
      browser,
      browserStatus: "checking",
      step: `Checking ${browser}…`,
      message: undefined,
      reason: undefined,
    });
    const result = await checkSource(browser);
    if (result.status === "signed_in") {
      writeSetting(BROWSER_KEY, browser);
      markConnected(browser);
      return true;
    }
    // YouTube itself is the problem, not this browser — every remaining one
    // would fail identically, so stop rather than grinding through them.
    if (result.status === "probe_unavailable") {
      markFailed(result, browser);
      return false;
    }
    // "not installed" is not a failure worth reporting back to the user.
    if (result.status !== "profile_missing") {
      failures.push(`${browser}: ${result.message ?? result.status}`);
    }
  }

  set({
    connected: false,
    busy: false,
    step: undefined,
    browserStatus: "signed_out",
    probed: true,
    restoring: false,
    message:
      failures.length === 0
        ? "No supported browser is installed with a YouTube session."
        : "None of your browsers would hand over a YouTube session.",
    reason: failures.join("\n") || undefined,
  });
  return false;
}

/** Fallback path: check one specific browser, when the user picks it. */
export function checkBrowserConnection(): Promise<boolean> {
  return checkConnection(state.browser);
}

export async function openYouTubeSignIn(): Promise<void> {
  set({ message: undefined, reason: undefined });
  try {
    const api = electron();
    if (api?.openYouTubeSignIn) {
      const result = await api.openYouTubeSignIn();
      if (!result.ok) throw new Error(result.error || "Could not open YouTube.");
    } else {
      window.open("https://www.youtube.com/signin", "_blank", "noopener");
    }
    set({
      browserStatus: "ready",
      message: "Sign in to YouTube, leave the browser tab open, then return here.",
    });
  } catch (error) {
    set({
      message: error instanceof Error ? error.message : "Could not open YouTube.",
    });
  }
}
