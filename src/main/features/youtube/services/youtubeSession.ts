// src/main/features/youtube/services/youtubeSession.ts — the YouTube session yt-dlp runs with.
//
// One Netscape cookies.txt in userData, exported by the user from their own
// browser and adopted here, so yt-dlp can be run with `--cookies <file>`.
//
// The app used to harvest this itself from a login window on
// accounts.google.com. It cannot: Google refuses Google Account sign-in from
// embedded browser frameworks as deliberate policy (enforced since Jan 2021),
// and Electron announces itself as one through User-Agent Client Hints no
// matter what UA string it sends. The file is now the only source.
//
// Nothing leaves the machine, and cookie VALUES never reach the renderer —
// only booleans and a path.
import electron from "electron";
const { app, session } = electron;
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import { checkCookieImport } from "./cookieFile";
import {
  isRelevantDomain,
  parseCookieRows,
  resolveAuthState,
} from "./cookieState";

// Only ever cleared, never read. See clear().
const LEGACY_PARTITION = "persist:youtube";

function cookieFilePath() {
  return path.join(app.getPath("userData"), "yt-cookies.txt");
}

/** Reads the cookie file as text, or null when there is no file to read. */
async function readCookieFileText() {
  try {
    return await fsp.readFile(cookieFilePath(), "utf8");
  } catch {
    return null;
  }
}

/**
 * Cheap check used on launch — no network call.
 *
 * Read-only by design. The imported file IS the sign-in; there is nowhere
 * else to regenerate it from, so anything that wrote here would be writing
 * over the only session the user has.
 *
 * Returns { connected, path } plus source / expiresAt / expired for callers
 * that want to say more than yes-or-no.
 */
async function probe() {
  try {
    const filePath = cookieFilePath();
    const state = resolveAuthState({ fileText: await readCookieFileText() });
    return {
      connected: state.connected && fs.existsSync(filePath),
      path: state.connected ? filePath : null,
      source: state.source,
      expiresAt: state.expiresAt,
      expired: state.expired,
      reason: state.reason,
    };
  } catch (err: any) {
    return {
      connected: false,
      path: null,
      source: "none",
      expiresAt: null,
      expired: false,
      error: err && err.message ? err.message : "Probe failed",
    };
  }
}

/**
 * Adopts a Netscape cookies.txt the user exported from their own browser.
 *
 * This is the route that works everywhere. Reading a browser's own cookie
 * store instead fails on Windows Chrome: the running browser holds an
 * exclusive lock on the database, and since Chrome 127 App-Bound Encryption
 * means even a readable copy cannot be decrypted from another process.
 * Exporting from inside the browser sidesteps both, because the browser does
 * its own decryption.
 */
async function importCookieFile(sourcePath: unknown) {
  try {
    if (typeof sourcePath !== "string" || !sourcePath) {
      return { ok: false, error: "No file chosen." };
    }
    return await importCookieText(await fsp.readFile(sourcePath, "utf8"));
  } catch (err: any) {
    return {
      ok: false,
      error: err && err.message ? err.message : "Could not read that file.",
    };
  }
}

/**
 * Adopts cookies.txt TEXT, validated, then commits it atomically (temp file
 * beside the target, then rename). Used by the file picker and by a file
 * dropped on the window, whose contents the renderer reads itself.
 *
 * The same canonical path as ever: userData/yt-cookies.txt. A crash mid-write
 * can never leave a half file, because rename() is atomic.
 */
async function importCookieText(text: unknown) {
  try {
    const raw = String(text || "");
    const refused = checkCookieImport(raw);
    if (refused) return { ok: false, kind: refused.kind, error: refused.reason };

    const target = cookieFilePath();
    const tmp = `${target}.import-${process.pid}-${Date.now()}`;
    try {
      await fsp.writeFile(tmp, raw, { mode: 0o600 });
      await fsp.rename(tmp, target);
    } finally {
      await fsp.rm(tmp, { force: true }).catch(() => {});
    }
    try {
      await fsp.chmod(target, 0o600);
    } catch {
      /* best effort on Windows */
    }
    return { ok: true, count: parseCookieRows(raw).filter((row) => isRelevantDomain(row.domain)).length };
  } catch (err: any) {
    return {
      ok: false,
      error: err && err.message ? err.message : "Could not read that file.",
    };
  }
}

async function clear() {
  try {
    // Anyone who ever opened the old in-app login window still has that
    // partition on disk, holding live Google cookies nothing reads any more.
    // Disconnecting is the one moment the user has asked for them to go.
    await session.fromPartition(LEGACY_PARTITION).clearStorageData();
  } catch {
    /* ignore */
  }
  try {
    await fsp.rm(cookieFilePath(), { force: true });
  } catch {
    /* ignore */
  }
  return { ok: true };
}

export {
  importCookieFile,
  importCookieText,
  probe,
  clear,
  cookieFilePath,
};
