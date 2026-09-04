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

const isElectron = typeof window !== "undefined" && !!window.electronAPI?.isElectron;

/** Silent launch probe — never opens a window, never blocks the UI. */
export async function probeConnection(): Promise<void> {
  if (state.probed || state.busy) return;
  if (!isElectron || !window.electronAPI?.youtubeProbe) {
    set({ probed: true });
    return;
  }
  try {
    const result = await window.electronAPI.youtubeProbe();
    set({
      probed: true,
      connected: !!result.connected,
      mode: result.connected ? "app" : state.mode,
      cookieFile: result.path ?? null,
    });
  } catch {
    set({ probed: true });
  }
}

/** Opens the in-app login window and stores the resulting cookie file. */
export async function connectInApp(): Promise<boolean> {
  if (!isElectron || !window.electronAPI?.youtubeConnect) return false;
  set({ busy: true, message: undefined });
  try {
    const result = await window.electronAPI.youtubeConnect();
    if (result.connected) {
      set({
        busy: false,
        connected: true,
        mode: "app",
        cookieFile: result.path ?? null,
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

/** Fallback path: probe the external browser's cookie store. */
export async function checkBrowserSession(): Promise<YouTubeAuthState> {
  set({ busy: true, browserStatus: "checking", message: undefined });
  try {
    const res = await fetch(apiUrl("/api/auth/youtube/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browser: state.browser }),
    });
    const data = await parseJson<{
      status: YouTubeAuthState;
      browser: CookieBrowser;
      message?: string;
    }>(res);
    if (data.status === "signed_in") {
      set({
        busy: false,
        connected: true,
        mode: "browser",
        cookieFile: null,
        browser: data.browser ?? state.browser,
        browserStatus: "signed_in",
        message: undefined,
      });
      return "signed_in";
    }
    set({
      busy: false,
      browserStatus: data.status ?? "extractor_error",
      message: data.message,
    });
    return data.status ?? "extractor_error";
  } catch {
    set({
      busy: false,
      browserStatus: "extractor_error",
      message: "Couldn't reach the local backend.",
    });
    return "extractor_error";
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

// --- Prompt dismissal ----------------------------------------------------

const DISMISS_KEY = "clipper.ytPromptDismissed";

export function isPromptSuppressed(): boolean {
  return readSetting<boolean>(DISMISS_KEY, false) === true;
}

export function suppressPrompt(): void {
  writeSetting(DISMISS_KEY, true);
}
