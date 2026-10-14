// electron/youtubeSession.cjs — the YouTube session yt-dlp runs with.
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
const { app, session } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const { validateCookieText } = require("./cookieFile.cjs");
const { resolveAuthState } = require("./cookieState.cjs");

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
  } catch (err) {
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
async function importCookieFile(sourcePath) {
  try {
    if (typeof sourcePath !== "string" || !sourcePath) {
      return { ok: false, error: "No file chosen." };
    }
    const text = await fsp.readFile(sourcePath, "utf8");
    const check = validateCookieText(text);
    if (!check.ok) return { ok: false, error: check.reason };

    const target = cookieFilePath();
    const tmp = `${target}.tmp`;
    await fsp.writeFile(tmp, text, { mode: 0o600 });
    await fsp.rename(tmp, target);
    try {
      await fsp.chmod(target, 0o600);
    } catch {
      /* best effort on Windows */
    }
    return { ok: true, count: check.count };
  } catch (err) {
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

module.exports = {
  importCookieFile,
  probe,
  clear,
  cookieFilePath,
};
