/**
 * File: persist.ts
 * Path: src/lib/persist.ts
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

export function readSetting<T = string>(key: string, fallback: T): T {
  if (api()) {
    const value = cache[key];
    return value === undefined || value === null ? fallback : (value as T);
  }
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return raw as unknown as T;
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
