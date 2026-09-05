/**
 * File: youtubeConnection.ts
 * Path: src/lib/youtubeConnection.ts
 * Description: Required app-wide YouTube connection backed by local browser cookies.
 */
import { useSyncExternalStore } from "react";
import {
  COOKIE_BROWSERS,
  apiUrl,
  parseJson,
  type CookieBrowser,
  type YouTubeAuthState,
} from "./clip";
import { readSetting, writeSetting } from "./persist";

export interface YouTubeConnectionState {
  connected: boolean;
  browser: CookieBrowser;
  browserStatus: YouTubeAuthState;
  busy: boolean;
  step?: string;
  message?: string;
  probed: boolean;
}

export interface CookiePayload {
  cookiesFromBrowser?: CookieBrowser;
}

function isCookieBrowser(value: unknown): value is CookieBrowser {
  return typeof value === "string" && COOKIE_BROWSERS.includes(value as CookieBrowser);
}

function initialBrowser(): CookieBrowser {
  const saved = readSetting<string>("clipper.cookieBrowser", "chrome");
  return isCookieBrowser(saved) ? saved : "chrome";
}

let state: YouTubeConnectionState = {
  connected: false,
  browser: initialBrowser(),
  browserStatus: "idle",
  busy: false,
  probed: false,
};

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
  return state.connected ? { cookiesFromBrowser: state.browser } : {};
}

export function markDisconnected(message?: string): void {
  set({
    connected: false,
    browserStatus: "signed_out",
    message,
    probed: true,
  });
}

async function defaultBrowser(): Promise<CookieBrowser | null> {
  if (!window.electronAPI?.getDefaultBrowser) return null;
  try {
    const result = await window.electronAPI.getDefaultBrowser();
    return isCookieBrowser(result.browser) ? result.browser : null;
  } catch {
    return null;
  }
}

async function checkBrowserSession(
  browser: CookieBrowser,
): Promise<{ status: YouTubeAuthState; message?: string }> {
  try {
    const response = await fetch(apiUrl("/api/auth/youtube/status"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ browser }),
    });
    const data = await parseJson<{
      status?: YouTubeAuthState;
      message?: string;
    }>(response);
    return {
      status: data.status ?? "extractor_error",
      message: data.message,
    };
  } catch {
    return {
      status: "extractor_error",
      message: "Couldn't reach the local engine.",
    };
  }
}

async function browserOrder(): Promise<CookieBrowser[]> {
  const detected = await defaultBrowser();
  return [...new Set([detected, state.browser, ...COOKIE_BROWSERS])].filter(
    isCookieBrowser,
  );
}

function bestFailure(
  failures: Array<{ status: YouTubeAuthState; message?: string }>,
): string {
  const important = failures.find(({ status }) =>
    ["locked", "decrypt_failed", "timeout", "extractor_error"].includes(status),
  );
  return (
    important?.message ??
    "No signed-in YouTube session was found. Sign in in your browser, leave the tab open, then check again."
  );
}

async function runConnectionCheck(): Promise<boolean> {
  set({ busy: true, step: "Finding your browser…", message: undefined });
  const order = await browserOrder();
  const failures: Array<{ status: YouTubeAuthState; message?: string }> = [];

  for (const browser of order) {
    set({ step: `Checking ${browser}…`, browserStatus: "checking" });
    const result = await checkBrowserSession(browser);
    if (result.status === "signed_in") {
      writeSetting("clipper.cookieBrowser", browser);
      set({
        connected: true,
        browser,
        browserStatus: "signed_in",
        busy: false,
        step: undefined,
        message: undefined,
        probed: true,
      });
      return true;
    }
    failures.push(result);
  }

  set({
    connected: false,
    browserStatus: "signed_out",
    busy: false,
    step: undefined,
    message: bestFailure(failures),
    probed: true,
  });
  return false;
}

/** Runs at most one browser-cookie check at a time. */
export function checkConnection(): Promise<boolean> {
  if (activeCheck) return activeCheck;
  activeCheck = runConnectionCheck().finally(() => {
    activeCheck = null;
  });
  return activeCheck;
}

export async function probeConnection(force = false): Promise<void> {
  if (state.probed && !force) return;
  await checkConnection();
}

export async function revalidateConnection(): Promise<void> {
  if (activeCheck) return;
  if (state.connected) {
    set({ busy: true, step: "Checking YouTube…" });
    const current = await checkBrowserSession(state.browser);
    if (current.status === "signed_in") {
      set({ busy: false, step: undefined, message: undefined, probed: true });
      return;
    }
  }
  await checkConnection();
}

export async function openYouTubeSignIn(): Promise<void> {
  set({ message: undefined });
  try {
    if (window.electronAPI?.openYouTubeSignIn) {
      const result = await window.electronAPI.openYouTubeSignIn();
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