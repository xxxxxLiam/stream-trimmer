/**
 * File: persist.ts
 * Path: src/renderer/src/shared/utils/persist.ts
 * Description: Sync settings storage — Electron userData file, localStorage in the browser.
 */

type Api = NonNullable<Window["electronAPI"]>;

function api(): Api | null {
  if (typeof window === "undefined") return null;
  const a = window.electronAPI;
  return a && a.settingsSnapshot && a.setSetting ? a : null;
}

/** In-memory mirror of the Electron settings file (seeded at preload time). */
const cache: Record<string, unknown> = { ...(api()?.settingsSnapshot ?? {}) };

/**
 * A stored value of the wrong kind for what the caller expects (a number where a folder path goes) is
 * ignored and the default is used for that one key. It never throws and never touches other keys, so one
 * bad value cannot crash the app on every launch. Only primitive defaults are checked; objects and lists
 * are normalized by their own readers.
 */
function ofKind<T>(value: unknown, fallback: T): T {
  const kind = typeof fallback;
  if (kind !== "string" && kind !== "number" && kind !== "boolean") return value as T;
  return typeof value === kind && !(kind === "number" && !Number.isFinite(value as number)) ? (value as T) : fallback;
}

export function readSetting<T = string>(key: string, fallback: T): T {
  if (api()) {
    const value = cache[key];
    return value === undefined || value === null ? fallback : ofKind(value, fallback);
  }
  if (typeof window === "undefined" || !window.localStorage) return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw);
    // A plain string kept without quotes that happens to read as JSON ("12") is still that string.
    return typeof fallback === "string" && typeof parsed !== "string" ? (raw as unknown as T) : ofKind(parsed, fallback);
  } catch {
    return typeof fallback === "string" || fallback === undefined || typeof fallback === "object" ? (raw as unknown as T) : fallback;
  }
}

export function writeSetting(key: string, value: unknown): void {
  const a = api();
  if (a) {
    if (value === null || value === undefined) delete cache[key];
    else cache[key] = value;
    void a.setSetting?.(key, value ?? null);
    return;
  }
  if (typeof window === "undefined") return;
  if (value === null || value === undefined) {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, JSON.stringify(value));
  }
}
