/**
 * File: ownerGate.ts
 * Path: src/renderer/src/shared/utils/ownerGate.ts
 * Description: Decides whether the channel-data tool exists in this running app.
 *
 * Two layers:
 *  1. Build time. `__CHANNEL_DATA__` (from VITE_ENABLE_CHANNEL_DATA, off by
 *     default) lets a build omit the feature code entirely.
 *  2. Run time. The main process hashes this computer's id with a build-time
 *     salt and says yes or no to one question: is that hash in
 *     VITE_OWNER_MACHINES? The raw id never reaches the renderer.
 *
 * HONEST LIMIT: the feature code still ships in a build that has it enabled,
 * and the list and salt are in the bundle. Someone with devtools could find
 * it. This is obscurity plus a device check, not a security boundary.
 *
 * Usage: wrap routes, links and help tasks in `if (__CHANNEL_DATA__)` so a
 * build without it drops them, and show them only when useOwnerAccess() is
 * true. A non-matching install gets no prompt, no message, nothing.
 */
import { useEffect, useState } from "react";

declare const __CHANNEL_DATA__: boolean | undefined;
declare const __OWNER_MACHINES__: string | undefined;
declare const __OWNER_SALT__: string | undefined;

/** Compile-time switch. Static so bundlers can drop the feature when false. */
export const CHANNEL_DATA_BUILT: boolean =
  typeof __CHANNEL_DATA__ !== "undefined" && __CHANNEL_DATA__ === true;

const RAW_LIST: string =
  typeof __OWNER_MACHINES__ !== "undefined" ? (__OWNER_MACHINES__ ?? "") : "";
const SALT: string =
  typeof __OWNER_SALT__ !== "undefined" ? (__OWNER_SALT__ ?? "") : "";

/** "*" in the list means any machine: a private build that is not shared. */
export const ANY_MACHINE = "*";

/** Splits the comma-separated list into trimmed, lowercase, non-empty hashes. */
export function parseMachineList(raw: string | undefined | null): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

/** Pure decision, so it can be tested without Electron. Fails closed. */
export function decideAccess(input: {
  built: boolean;
  list: string[];
  salt: string;
  localMatch: boolean;
}): boolean {
  if (!input.built) return false;
  if (input.list.includes(ANY_MACHINE)) return true;
  if (input.list.length === 0 || !input.salt) return false;
  
  return input.localMatch;
}

let cached: Promise<boolean> | null = null;

/** Resolves once per session. Never throws, never prompts. */
export function checkOwnerAccess(): Promise<boolean> {
  if (!CHANNEL_DATA_BUILT) return Promise.resolve(false);
  if (cached) return cached;
  const list = parseMachineList(RAW_LIST);
  cached = (async () => {
    let localMatch = false;
    // Always asked, "*" included: the main process remembers the verdict so
    // its own handlers (export:save) can refuse a non-owner.
    try {
      const ask = window.electronAPI?.isOwnerMachine;
      if (ask) localMatch = (await ask(list, SALT)) === true;
    } catch {
      localMatch = false;
    }
    return decideAccess({ built: true, list, salt: SALT, localMatch });
  })();
  return cached;
}

/** False until the check resolves, and permanently false for non-owners. */
export function useOwnerAccess(): boolean {
  const [ok, setOk] = useState(false);
  useEffect(() => {
    let live = true;
    void checkOwnerAccess().then((v) => {
      if (live) setOk(v);
    });
    return () => {
      live = false;
    };
  }, []);
  return ok;
}
