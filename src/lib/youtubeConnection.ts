/**
 * File: youtubeConnection.ts
 * Path: src/lib/youtubeConnection.ts
 * Description: App-wide YouTube connection store shared by every workspace tab.
 *
 * Two ways to connect, both fully local and free:
 *  - "app"     : an in-app Electron login window whose cookies are exported to
 *                a cookies.txt yt-dlp reads (preferred — one click, no locks).
 *  - "browser" : the legacy fallback reading the external browser's cookie
 *                store via yt-dlp --cookies-from-browser.
 * Cookie values never enter this module — only booleans, a file path and a
 * browser name.
 */
import { useSyncExternalStore } from "react";
import { apiUrl, parseJson, type CookieBrowser, type YouTubeAuthState } from "./clip";
import { readSetting, writeSetting } from "./persist";

export type ConnectionMode = "app" | "browser";

export interface YouTubeConnectionState {
  /** True when downloads will be authenticated. */
  connected: boolean;
  mode: ConnectionMode | null;
  /** Path of the app-managed cookies.txt (Electron only). */
  cookieFile: string | null;
  browser: CookieBrowser;
  /** Status of the last browser-fallback probe. */
  browserStatus: YouTubeAuthState;
  busy: boolean;
  /** Short progress line shown while connecting. */
  step?: string;
  message?: string;
  /** True once the launch probe has run. */
  probed: boolean;
}

export interface CookiePayload {
  cookieFile?: string;
  cookiesFromBrowser?: CookieBrowser;
}

const BROWSERS: CookieBrowser[] = [
  "chrome",
  "safari",
  "edge",
  "firefox",
  "brave",
  "chromium",
];

function initialBrowser(): CookieBrowser {
  const saved = readSetting<string>("clipper.cookieBrowser", "chrome");
  return (BROWSERS as string[]).includes(saved)
    ? (saved as CookieBrowser)
    : "chrome";
}

let state: YouTubeConnectionState = {
  connected: false,
  mode: null,
  cookieFile: null,
  browser: initialBrowser(),
  browserStatus: "idle",
  busy: false,
  probed: false,
};

const listeners = new Set<() => void>();

function set(patch: Partial<YouTubeConnectionState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
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

/** Current connection flag, readable outside React. */
export function isConnected(): boolean {
  return state.connected;
}

/** Cookie options for an API request, or {} when not connected. */
export function cookiePayload(): CookiePayload {
  if (!state.connected) return {};
  if (state.mode === "app" && state.cookieFile)
    return { cookieFile: state.cookieFile };
  if (state.mode === "browser") return { cookiesFromBrowser: state.browser };
  return {};
}

/** Clears a rejected session so the shell immediately reopens the prompt. */
export function markDisconnected(message?: string): void {
  set({
    connected: false,
    mode: null,
    cookieFile: null,
    browserStatus: "signed_out",
    message,
    probed: true,
  });
}

async function validateSession(payload: CookiePayload): Promise<{
  valid: boolean;
  message?: string;
}> {
  try {
    const res = await fetch(apiUrl("/api/auth/youtube/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await parseJson<{
      status?: YouTubeAuthState;
      message?: string;
    }>(res);
    return {
      valid: res.ok && data.status === "signed_in",
      message: data.message,
    };
  } catch {
    return {
      valid: false,
      message: "YouTube could not be verified right now.",
    };
  }
}

const isElectron = typeof window !== "undefined" && !!window.electronAPI?.isElectron;

/**
 * Silent probe — never opens a window, never blocks the UI. Runs once on
 * launch, and again on `revalidateConnection()` so a YouTube-side logout is
 * noticed instead of leaving a stale "connected" chip.
 */
export async function probeConnection(force = false): Promise<void> {
  if ((state.probed && !force) || state.busy) return;
  if (!isElectron || !window.electronAPI?.youtubeProbe) {
    set({ probed: true });
    return;
  }
  try {
    const result = await window.electronAPI.youtubeProbe();
    const localSessionExists = !!result.connected && !!result.path;
    const validation = localSessionExists && result.path
      ? await validateSession({ cookieFile: result.path })
      : { valid: false, message: undefined };
    const connected = localSessionExists && validation.valid;
    set({
      probed: true,
      connected,
      // Browser-cookie sessions are not covered by the app probe; keep them.
      mode: connected ? "app" : state.mode === "browser" ? "browser" : null,
      cookieFile: connected ? (result.path ?? null) : null,
      message: connected ? undefined : validation.message,
    });
  } catch {
    set({ probed: true });
  }
}

/** Re-checks the active session against YouTube, not just local cookie presence. */
export async function revalidateConnection(): Promise<void> {
  if (state.mode === "browser") {
    const result = await checkBrowserSession(state.browser);
    if (result.status !== "signed_in") markDisconnected(result.message);
    return;
  }
  await probeConnection(true);
}

/** Opens the in-app login window and stores the resulting cookie file. */
export async function connectInApp(): Promise<boolean> {
  if (!isElectron || !window.electronAPI?.youtubeConnect) return false;
  set({ busy: true, message: undefined });
  try {
    const result = await window.electronAPI.youtubeConnect();
    if (result.connected) {
      const cookieFile = result.path ?? null;
      const validation = cookieFile
        ? await validateSession({ cookieFile })
        : { valid: false, message: "YouTube did not return a valid session." };
      if (!validation.valid) {
        set({
          busy: false,
          connected: false,
          mode: null,
          cookieFile: null,
          message: validation.message,
        });
        return false;
      }
      set({
        busy: false,
        connected: true,
        mode: "app",
        cookieFile,
        message: undefined,
      });
      return true;
    }
    set({
      busy: false,
      message: result.error
        ? result.error
        : "Sign-in window closed before you were signed in.",
    });
    return false;
  } catch {
    set({ busy: false, message: "Could not open the sign-in window." });
    return false;
  }
}

export async function disconnect(): Promise<void> {
  if (isElectron && window.electronAPI?.youtubeDisconnect) {
    try {
      await window.electronAPI.youtubeDisconnect();
    } catch {
      /* ignore */
    }
  }
  set({
    connected: false,
    mode: null,
    cookieFile: null,
    browserStatus: "idle",
    message: undefined,
  });
}

export function setBrowser(browser: CookieBrowser): void {
  writeSetting("clipper.cookieBrowser", browser);
  set({
    browser,
    browserStatus: "idle",
    ...(state.mode === "browser"
      ? { connected: false, mode: null }
      : {}),
  });
}

/** Fallback path: probe one external browser's cookie store. */
export async function checkBrowserSession(
  browser: CookieBrowser = state.browser,
): Promise<{ status: YouTubeAuthState; message?: string }> {
  try {
    const res = await fetch(apiUrl("/api/auth/youtube/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browser }),
    });
    const data = await parseJson<{
      status: YouTubeAuthState;
      browser: CookieBrowser;
      message?: string;
    }>(res);
    return { status: data.status ?? "extractor_error", message: data.message };
  } catch {
    return {
      status: "extractor_error",
      message: "Couldn't reach the local backend.",
    };
  }
}

/** Opens YouTube in the user's default browser (fallback flow helper). */
export async function openExternalSignIn(): Promise<void> {
  if (isElectron && window.electronAPI?.openYouTubeSignIn) {
    await window.electronAPI.openYouTubeSignIn();
  } else {
    window.open("https://www.youtube.com/signin", "_blank", "noopener");
  }
  set({ browserStatus: "ready" });
}

/**
 * The one and only connect action. Tries the in-app sign-in window first
 * (desktop), then silently sweeps every supported browser's cookie store and
 * connects with the first one that reports a signed-in session.
 */
export async function connect(): Promise<boolean> {
  if (state.busy) return state.connected;
  set({ busy: true, message: undefined, step: undefined });

  if (isElectron && window.electronAPI?.youtubeConnect) {
    set({ step: "Opening sign-in…" });
    try {
      const result = await window.electronAPI.youtubeConnect();
      if (result.connected) {
        const cookieFile = result.path ?? null;
        const validation = cookieFile
          ? await validateSession({ cookieFile })
          : { valid: false, message: "YouTube did not return a valid session." };
        if (!validation.valid) {
          set({
            busy: false,
            step: undefined,
            connected: false,
            mode: null,
            cookieFile: null,
            message: validation.message,
          });
          return false;
        }
        set({
          busy: false,
          step: undefined,
          connected: true,
          mode: "app",
          cookieFile,
          message: undefined,
        });
        return true;
      }
    } catch {
      /* fall through to the browser sweep */
    }
  }

  // Preferred browser first, then the rest.
  const order = [state.browser, ...BROWSERS.filter((b) => b !== state.browser)];
  let locked = false;
  for (const browser of order) {
    set({ step: `Checking ${browser}…`, browserStatus: "checking" });
    const { status } = await checkBrowserSession(browser);
    if (status === "signed_in") {
      writeSetting("clipper.cookieBrowser", browser);
      set({
        busy: false,
        step: undefined,
        connected: true,
        mode: "browser",
        cookieFile: null,
        browser,
        browserStatus: "signed_in",
        message: undefined,
      });
      return true;
    }
    if (status === "locked") locked = true;
  }

  set({
    busy: false,
    step: undefined,
    browserStatus: "signed_out",
    message: locked
      ? "A browser's cookie store is locked. Fully quit it (Chrome: Quit, not just close the window) and try again."
      : "No signed-in YouTube session found. Sign in to YouTube in your browser, then try again.",
  });
  return false;
}


