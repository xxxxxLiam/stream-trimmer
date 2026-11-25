/**
 * File: youtubeConnection.ts
 * Path: src/renderer/src/shared/utils/youtubeConnection.ts
 * Description: App-wide YouTube connection. Primary path is a cookies.txt the
 * user exported from their own browser and imported here; letting yt-dlp read
 * a browser's own cookie store is kept as a secondary route.
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
/** The user chose to continue without signing in. Survives restarts; the header chip still says "Not signed in". */
const SKIPPED_KEY = "clipper.signInSkipped";

export interface YouTubeConnectionState {
  connected: boolean;
  /** Which session the app is currently using. */
  source: AuthSource;
  /** Browser selected for the secondary path (independent of `source`). */
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
  /** Whether a cookies.txt can be imported at all (desktop build only). */
  canImport: boolean;
  /** Epoch ms the imported sign-in runs out, or null (session cookies, or unknown). */
  expiresAt: number | null;
  /** The saved sign-in is on disk but past its date, or YouTube rejected it. */
  expired: boolean;
  /**
   * Something went wrong that is NOT the sign-in (rate limit, YouTube not
   * answering). Re-importing cookies does not fix it, so it is kept apart from
   * `message`, which the connect screen treats as "your sign-in failed".
   */
  notice?: string;
  /**
   * The user chose to carry on signed out (360p). Only hides the connect
   * screen; it is not a connection and never feeds `cookiePayload`. Lasts for
   * this app session, and clears on any successful sign-in.
   */
  skipped: boolean;
  /**
   * The automatic browser sweep has run to its end without producing a
   * sign-in (nothing found, or YouTube throttled it). The connect screen opens
   * its manual route only after this: it is the fact that "Not found" rests on.
   * Never cleared by a re-check, so asking again does not hide the manual route.
   */
  sweepEnded: boolean;
  /** True from launch until the launch sign-in check (cookies, then browsers) has ended, in the desktop app. */
  launching: boolean;
  /** The last imported cookies.txt was rejected (unreadable, or YouTube refused it). */
  importRejected: boolean;
}

/** The states a sign-in can be in; `checking` is transient. */
export type SessionStatus = "signed_in" | "expiring_soon" | "expired" | "not_signed_in" | "checking";

/** "Fri 12 Mar 2027": the day it stops working, in the user's own locale. */
export function formatExpiryDay(expiresAt: number): string {
  try {
    return new Date(expiresAt).toLocaleDateString(undefined, {
      weekday: "short",
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return new Date(expiresAt).toISOString().slice(0, 10);
  }
}

/**
 * Which quality a request asks for. No format or quality choice exists anywhere (decisions: MP4 at 1080p, or the
 * highest the video has below that), so nothing is stored per campaign. The engine refuses an MP4 above 360p
 * without a sign-in, so signed out the request goes out at 360p; signed in it asks for 1080p. Audio is unchanged.
 * Pure so the rule is testable; the clipper's quality state is only ever set from it.
 */
export function requestedQuality(input: { signedOut: boolean; format: string; quality: string }): string {
  if (input.format !== "mp4") return input.quality;
  return input.signedOut ? "360" : "1080";
}

/**
 * No session, and nothing still looking for one: every request goes out signed out. While the launch check or a
 * sweep runs the answer is "not yet", never "signed out", so a quick first clip is not sent at 360p with a
 * sign-in toast just because the check had not finished.
 */
export function isSignedOut(s: Pick<YouTubeConnectionState, "connected" | "restoring"> & Partial<Pick<YouTubeConnectionState, "busy" | "launching">>): boolean {
  return !s.connected && !s.restoring && s.busy !== true && s.launching !== true;
}

/** The current state, for code that decides at the moment of an action rather than at render. */
export function connectionNow(): YouTubeConnectionState {
  return state;
}

/** The launch check has ended (it found a session, found none, or failed): from here a missing session is real. */
export function endLaunchCheck(): void {
  if (state.launching || state.busy) set({ launching: false, busy: false, step: undefined });
}

/** Resolves once nothing is still looking for a session (or after `timeoutMs`), so a clip can pick its quality. */
export function whenSignInSettled(timeoutMs = 20000): Promise<void> {
  const pending = () => state.restoring || state.busy || state.launching;
  if (!pending()) return Promise.resolve();
  return new Promise((resolve) => {
    const done = () => {
      clearTimeout(timer);
      listeners.delete(check);
      resolve();
    };
    const check = () => {
      if (!pending()) done();
    };
    const timer = setTimeout(done, timeoutMs);
    listeners.add(check);
  });
}

export interface CookiePayload {
  cookiesFromBrowser?: AuthSource;
}

function isCookieBrowser(value: unknown): value is CookieBrowser {
  return typeof value === "string" && COOKIE_BROWSERS.includes(value as CookieBrowser);
}

/**
 * Desktop bridge members this module needs beyond what vite-env.d.ts declares.
 * `probeYouTube` carries the saved file's expiry only once the main-process
 * handler forwards it; `importYouTubeCookiesText` needs its own IPC. Both are
 * optional here so an older build degrades instead of throwing.
 */
interface StoredProbe {
  connected: boolean;
  error?: string;
  expiresAt?: number | null;
  expired?: boolean;
}
interface CookieBridge {
  importYouTubeCookiesText?: (
    text: string,
  ) => Promise<{ ok: boolean; count?: number; error?: string; kind?: string }>;
}

function electron() {
  return typeof window === "undefined"
    ? undefined
    : (window.electronAPI as (NonNullable<Window["electronAPI"]> & CookieBridge) | undefined);
}

async function probeStored(): Promise<StoredProbe | undefined> {
  return (await electron()?.probeYouTube?.()) as StoredProbe | undefined;
}

/** The cookie file lives in the main process, so it only exists on desktop. */
function hasCookieFile(): boolean {
  const api = electron();
  return Boolean(api?.importYouTubeCookies && api?.probeYouTube);
}

function initialBrowser(): CookieBrowser {
  const saved = readSetting<string>(BROWSER_KEY, "chrome");
  return isCookieBrowser(saved) ? saved : "chrome";
}

function initialSource(): AuthSource {
  const saved = readSetting<string>(SOURCE_KEY, "");
  // A saved "app" source is meaningless without the desktop bridge (browser
  // preview, or an older build), so fall back to the browser path there.
  if (saved === "app") return hasCookieFile() ? "app" : initialBrowser();
  if (isCookieBrowser(saved)) return saved;
  return hasCookieFile() ? "app" : initialBrowser();
}

let state: YouTubeConnectionState = {
  connected: false,
  source: initialSource(),
  browser: initialBrowser(),
  browserStatus: "idle",
  busy: false,
  probed: false,
  restoring: hasCookieFile(),
  canImport: hasCookieFile(),
  expiresAt: null,
  expired: false,
  skipped: readSetting<boolean>(SKIPPED_KEY, false) === true,
  sweepEnded: false,
  launching: electron() !== undefined,
  importRejected: false,
};

/**
 * Bumped whenever the user establishes a sign-in (or starts verifying an
 * imported file). A background sweep remembers the value it started under and
 * abandons itself, writing nothing, if it has moved on by the time a browser
 * check returns: a late sweep must never overwrite a sign-in made meanwhile.
 */
let signInEpoch = 0;

const listeners = new Set<() => void>();
let activeCheck: Promise<boolean> | null = null;

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

const EXPIRED_MESSAGE = (expiresAt: number | null) =>
  expiresAt
    ? `Your YouTube sign-in expired on ${formatExpiryDay(expiresAt)}. Import a fresh cookies.txt to get 1080p again.`
    : "Your saved YouTube sign-in has expired. Import a fresh cookies.txt to get 1080p again.";

function failureMessage(result: ProbeResult, source: AuthSource): string {
  if (result.message) return result.message;
  if (source === "app") {
    return "That cookies.txt is no longer valid. Export a fresh one and import it again.";
  }
  return "No signed-in YouTube session was found in that browser. Sign in there, leave the tab open, then check again.";
}

function markConnected(source: AuthSource) {
  signInEpoch += 1;
  writeSetting(SOURCE_KEY, source);
  writeSetting(SKIPPED_KEY, null);
  set({
    skipped: false,
    connected: true,
    source,
    browserStatus: "signed_in",
    busy: false,
    step: undefined,
    message: undefined,
    reason: undefined,
    probed: true,
    restoring: false,
    expired: false,
    notice: undefined,
    importRejected: false,
  });
}

/** YouTube answered, but not about the sign-in. These never mean "expired". */
const NOT_ABOUT_SIGN_IN: ReadonlySet<YouTubeAuthState> = new Set([
  "rate_limited",
  "probe_unavailable",
  "timeout",
  "inconclusive",
]);

/**
 * `hadFile`: a cookies.txt was on disk when the check ran, so a rejection means
 * that sign-in EXPIRED rather than that there never was one.
 */
function markFailed(result: ProbeResult, source: AuthSource, hadFile = false) {
  // Rate limiting (and YouTube simply not answering) says nothing about the
  // session. Dropping the sign-in here would send the user to re-import a
  // perfectly good file, which cannot help. Stay signed in and say what it is.
  if (source === "app" && hadFile && NOT_ABOUT_SIGN_IN.has(result.status)) {
    set({
      connected: true,
      source,
      browserStatus: result.status,
      busy: false,
      step: undefined,
      message: undefined,
      notice:
        result.message ??
        (result.status === "rate_limited"
          ? "YouTube is rate-limiting this network, not rejecting your sign-in. Wait a few minutes and try again. Re-importing cookies will not help."
          : "YouTube did not answer the check. Your sign-in is probably fine; try again in a moment."),
      reason: result.reason,
      probed: true,
      restoring: false,
    });
    return;
  }
  const rejected = source === "app" && hadFile && !NOT_ABOUT_SIGN_IN.has(result.status);
  set({
    connected: false,
    source,
    browserStatus: result.status,
    busy: false,
    step: undefined,
    message: failureMessage(result, source),
    notice: undefined,
    reason: result.reason,
    probed: true,
    restoring: false,
    expired: rejected ? true : state.expired,
  });
}

/** Cheap, offline: reads the saved file's expiry from the main process. */
async function readStoredExpiry(): Promise<void> {
  try {
    const stored = await probeStored();
    if (!stored) return;
    set({
      expiresAt: typeof stored.expiresAt === "number" ? stored.expiresAt : null,
      expired: Boolean(stored.expired) || (state.expired && !stored.connected),
    });
  } catch {
    /* the chip then simply has no date to show */
  }
}

/**
 * Re-reads the saved file's date. The chip calls this on focus and hourly so
 * that an approaching expiry is announced without any network request.
 */
export function refreshSessionStatus(): Promise<void> {
  return hasCookieFile() ? readStoredExpiry() : Promise.resolve();
}

/**
 * Launch-time restore. Reads the imported cookies.txt, then verifies it once.
 * On success the app opens straight into the main UI with no prompt — the
 * whole point of importing a file that is never rotated. Never runs on a
 * timer.
 */
export async function restoreConnection(): Promise<boolean> {
  const api = electron();
  if (!api?.probeYouTube) {
    set({ restoring: false });
    // Browser build (or an older desktop build): only pre-select a browser.
    await initBrowserSelection();
    return false;
  }
  set({ restoring: true, busy: true, step: "Checking your YouTube cookies…" });
  try {
    const stored = (await probeStored()) ?? { connected: false };
    const expiresAt = typeof stored.expiresAt === "number" ? stored.expiresAt : null;
    if (!stored.connected) {
      set({
        connected: false,
        busy: false,
        step: undefined,
        restoring: false,
        probed: true,
        browserStatus: stored.expired ? "signed_out" : "idle",
        message: stored.expired ? EXPIRED_MESSAGE(expiresAt) : undefined,
        expiresAt,
        expired: Boolean(stored.expired),
      });
      await initBrowserSelection();
      return false;
    }
    set({ expiresAt, expired: false });
    const result = await checkSource("app");
    if (result.status === "signed_in") {
      markConnected("app");
      return true;
    }
    markFailed(result, "app", true);
    return state.connected;
  } catch {
    set({ busy: false, step: undefined, restoring: false, probed: true });
    return false;
  }
}

/**
 * Adopts a cookies.txt the user exported from their own browser, then
 * verifies it. This is the path that works when the others cannot: Google
 * refuses Google Account sign-in from inside an app, and on Windows a running
 * Chrome locks its cookie database while App-Bound Encryption stops anything
 * else decrypting a copy.
 */
export async function importCookies(): Promise<boolean> {
  const api = electron();
  if (!api?.importYouTubeCookies) {
    set({ message: "Importing cookies needs the desktop app.", importRejected: true });
    return false;
  }
  set({ busy: true, step: "Reading the cookies file…", message: undefined, reason: undefined, importRejected: false });
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
        importRejected: true,
      });
      return false;
    }
    // The check runs yt-dlp against YouTube for real, so it is slow enough
    // that the button must stop saying "Reading the cookies file…".
    return await verifyImported();
  } catch (error) {
    set({
      busy: false,
      step: undefined,
      probed: true,
      message: error instanceof Error ? error.message : "Import failed.",
      importRejected: true,
    });
    return false;
  }
}

/** Verifies a just-imported file with a real request, then records its expiry. */
async function verifyImported(): Promise<boolean> {
  // The check runs yt-dlp against YouTube for real, so it is slow enough
  // that the button must stop saying "Reading the cookies file…".
  signInEpoch += 1; // an in-flight browser sweep must now stand down
  set({ step: "Checking those cookies with YouTube…", expired: false });
  await readStoredExpiry();
  const verified = await checkSource("app");
  if (verified.status === "signed_in") {
    markConnected("app");
    return true;
  }
  markFailed(verified, "app", true);
  if (!state.connected) set({ importRejected: true });
  return state.connected;
}

/**
 * Adopts a cookies.txt dropped on the window. The renderer reads the text and
 * hands it to the main process, which validates with cookieFile.ts and
 * commits atomically. Needs `importYouTubeCookiesText` in the preload.
 */
export async function importDroppedCookies(file: File): Promise<boolean> {
  const api = electron();
  if (!api?.importYouTubeCookiesText) {
    set({
      message:
        "Dropping a file needs a newer version of the app. Use Choose cookies.txt instead.",
      importRejected: true,
    });
    return false;
  }
  set({ busy: true, step: "Reading the cookies file…", message: undefined, notice: undefined, reason: undefined, importRejected: false });
  try {
    if (file.size > 5 * 1024 * 1024) {
      set({ busy: false, step: undefined, probed: true, message: "That file is too large to be a cookies.txt (over 5 MB).", importRejected: true });
      return false;
    }
    const result = await api.importYouTubeCookiesText(await file.text());
    if (!result.ok) {
      set({ busy: false, step: undefined, probed: true, message: result.error || "That file couldn't be used.", importRejected: true });
      return false;
    }
    return await verifyImported();
  } catch (error) {
    set({
      busy: false,
      step: undefined,
      probed: true,
      message: error instanceof Error ? error.message : "Import failed.",
      importRejected: true,
    });
    return false;
  }
}

/** Deletes the stored cookies.txt so the next launch asks again. */
export async function signOut(): Promise<void> {
  const api = electron();
  try {
    await api?.disconnectYouTube?.();
  } catch {
    /* clearing is best effort — the state below is what gates the UI */
  }
  writeSetting(SOURCE_KEY, null);
  set({
    expiresAt: null,
    expired: false,
    notice: undefined,
    connected: false,
    source: hasCookieFile() ? "app" : state.browser,
    browserStatus: "idle",
    busy: false,
    step: undefined,
    message: undefined,
    reason: undefined,
    probed: true,
    restoring: false,
    importRejected: false,
  });
}

/** Selects the browser used by the secondary path, without starting a check. */
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
    step:
      source === "app"
        ? "Checking your imported cookies…"
        : `Checking ${source}…`,
    browserStatus: "checking",
    message: undefined,
    reason: undefined,
  });
  // No probe first. The engine reads the same cookie file this would have
  // read, so asking the main process about it only delayed the answer.
  const result = await checkSource(source);
  if (result.status === "signed_in") {
    markConnected(source);
    return true;
  }
  markFailed(result, source, source === "app" && (state.expiresAt !== null || state.connected));
  return state.connected;
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
  // Busy and the epoch are claimed before the first await, so the connect screen
  // never sees a gap between "about to sweep" and "sweeping".
  const epoch = signInEpoch;
  set({ busy: true, browserStatus: "checking", step: "Checking browsers…", message: undefined, reason: undefined });
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
    if (signInEpoch !== epoch) return state.connected;
    set({
      busy: true,
      browser,
      browserStatus: "checking",
      step: `Checking ${browser}…`,
      message: undefined,
      reason: undefined,
    });
    const result = await checkSource(browser);
    // The user signed in (dropped a cookies.txt, say) while this was running.
    // Whatever this browser said, it must not touch that sign-in.
    if (signInEpoch !== epoch) return state.connected;
    if (result.status === "signed_in") {
      writeSetting(BROWSER_KEY, browser);
      markConnected(browser);
      return true;
    }
    // YouTube itself is the problem, not this browser — every remaining one
    // would fail identically, so stop rather than grinding through them.
    // Throttling is the same situation and worse to grind on: each extra
    // browser spends more of the quota that already ran out.
    if (
      result.status === "probe_unavailable" ||
      result.status === "rate_limited"
    ) {
      markFailed(result, browser);
      set({ sweepEnded: true });
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
    sweepEnded: true,
  });
  return false;
}

/**
 * Lets the user past the connect screen without signing in. The engine serves
 * signed-out requests at 360p, so this is honest, not a bypass.
 */
export function continueSignedOut(): void {
  if (state.connected) return;
  writeSetting(SKIPPED_KEY, true);
  set({ skipped: true });
}

/** Brings the connect screen back after `continueSignedOut`. */
export function resumeSignIn(): void {
  writeSetting(SKIPPED_KEY, null);
  set({ skipped: false });
}
