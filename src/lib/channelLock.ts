/**
 * File: channelLock.ts
 * Path: src/lib/channelLock.ts
 * Description: Local passcode gate for the channel exporter — hashing and unlock state.
 */

import { readSetting, writeSetting } from "./persist";

const STORAGE_KEY = "clipper.channelUnlocked";

/** SHA-256 of the owner passcode. Baked in so packaged builds always gate. */
const DEFAULT_PASSCODE_HASH =
  "0cd257a54a58aa1c00862c07297225561f663bd746b5856c5e7dfaaa3d488add";

/** Build-time override wins; otherwise the baked-in hash is used. */
export const CHANNEL_PASSCODE_HASH: string =
  (import.meta.env.VITE_CHANNEL_PASSCODE_HASH as string | undefined)?.trim() ||
  DEFAULT_PASSCODE_HASH;


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
  return readSetting(STORAGE_KEY, "") === CHANNEL_PASSCODE_HASH;
}

export function rememberUnlock(): void {
  if (typeof window === "undefined") return;
  writeSetting(STORAGE_KEY, CHANNEL_PASSCODE_HASH);
}

export function forgetUnlock(): void {
  if (typeof window === "undefined") return;
  writeSetting(STORAGE_KEY, null);
}
