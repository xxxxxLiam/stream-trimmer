/**
 * File: channelLock.ts
 * Path: src/lib/channelLock.ts
 * Description: Local passcode gate for the channel exporter — hashing and unlock state.
 */

const STORAGE_KEY = "clipper.channelUnlocked";

/** SHA-256 hash baked in at build time; empty means the feature is hidden. */
export const CHANNEL_PASSCODE_HASH: string =
  (import.meta.env.VITE_CHANNEL_PASSCODE_HASH as string | undefined)?.trim() ??
  "";

export function isLockConfigured(): boolean {
  return CHANNEL_PASSCODE_HASH.length > 0;
}

export async function hashPasscode(passcode: string): Promise<string> {
  const bytes = new TextEncoder().encode(passcode);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function verifyPasscode(passcode: string): Promise<boolean> {
  if (!isLockConfigured()) return false;
  const hashed = await hashPasscode(passcode);
  return hashed === CHANNEL_PASSCODE_HASH.toLowerCase();
}

/** Unlock state persists the hash, never the passcode itself. */
export function isUnlocked(): boolean {
  if (typeof window === "undefined" || !isLockConfigured()) return false;
  return window.localStorage.getItem(STORAGE_KEY) === CHANNEL_PASSCODE_HASH;
}

export function rememberUnlock(): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, CHANNEL_PASSCODE_HASH);
}

export function forgetUnlock(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
