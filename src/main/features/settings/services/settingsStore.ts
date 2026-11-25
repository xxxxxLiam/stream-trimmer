/**
 * File: settingsStore.ts
 * Path: src/main/features/settings/services/settingsStore.ts
 * Description: Durable JSON settings file. Pure Node (no electron import) so
 * the persistence rules can be tested directly.
 *
 * The renderer is served from a random loopback port, so localStorage is wiped
 * on every launch. Saved folders, folder names, download history and the
 * YouTube connection therefore live in a JSON file in the app's data folder.
 */
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { siblingDir as siblingDataDir } from "../../../../common/utils/siblingDir";
import { allowedRoots } from "../../../shared/utils/pathSafety";
import { APPROVED_ROOTS_KEY, PAGE_KEYS } from "./settingsKeys";

/**
 * Written by every save Clipr makes. A file with it is Clipr's own, so an empty one is the person's real state
 * (they removed everything); a file without it (`{}`, a cleaner's leftovers, a foreign file) is not.
 */
const WRITTEN_KEY = "clipper.settingsWritten";

/** Main-only: how the one-time "start fresh" prompt was settled ("fresh", "keep", or "new-install" when there was nothing to ask about). */
export const START_FRESH_KEY = "clipper.startFreshAnswered";

/** True when `data` holds anything the person set: at least one key the page writes, with a value. */
function hasUserData(data: any): boolean {
  return !!data && typeof data === "object" && Object.keys(data).some((k) => PAGE_KEYS.has(k) && data[k] !== null && data[k] !== undefined);
}


/**
 * v4 folder migration. Pure: returns a new object, never mutates its input.
 *  - The single `clipper.saveDir` (or, failing that, the first entry of
 *    `clipper.saveDirs`) becomes `clipper.clipsDir`. The old keys are left in
 *    place so a downgrade still finds its folder.
 *  - The data folder is flagged `clipper.dataDirConfirmed: false` so the UI asks
 *    the user to confirm it rather than silently choosing. Nothing is created
 *    on disk. This file ships in every build and must not name a folder: the
 *    suggested name belongs to the build shape, so it is only written when the
 *    caller supplies `dataFolderName` (a build that has the exporter). Without
 *    one, `clipper.dataDir` stays unset and the renderer derives its own
 *    suggestion from the clips folder (src/renderer/src/shared/utils/campaigns.ts, gated by build).
 * Idempotent: values the user already set are never overwritten.
 */
function migrateSettings(input: any, { dataFolderName }: any = {}) {
  const s = { ...input };
  if (!s["clipper.clipsDir"]) {
    const legacy =
      (typeof s["clipper.saveDir"] === "string" && s["clipper.saveDir"]) ||
      (Array.isArray(s["clipper.saveDirs"]) && typeof s["clipper.saveDirs"][0] === "string"
        ? s["clipper.saveDirs"][0]
        : "");
    if (legacy) s["clipper.clipsDir"] = legacy;
  }
  if (s["clipper.clipsDir"] && !s["clipper.dataDir"]) {
    if (dataFolderName) s["clipper.dataDir"] = siblingDataDir(s["clipper.clipsDir"], dataFolderName);
    if (s["clipper.dataDirConfirmed"] === undefined) s["clipper.dataDirConfirmed"] = false;
  }
  // Folders the app may write into are a list main keeps. Folders already chosen before this list
  // existed are carried over once; after that only the folder picker adds to it.
  if (s[APPROVED_ROOTS_KEY] === undefined) {
    const chosen = allowedRoots(s);
    if (chosen.length > 0) s[APPROVED_ROOTS_KEY] = chosen;
  }
  return s;
}

/**
 * Parses the text of a settings file. Tolerant of what editors and other tools
 * routinely add to a perfectly good file: a UTF-8 byte-order mark and
 * surrounding whitespace. Returns { status, data }:
 *  - "ok":      a JSON object
 *  - "empty":   blank file (nothing to lose)
 *  - "invalid": anything else — not JSON, or not an object
 */
function parseSettingsText(text: unknown) {
  const body = String(text).replace(/^\uFEFF/, "").trim();
  if (!body) return { status: "empty", data: {} };
  try {
    const raw = JSON.parse(body);
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      return { status: "ok", data: raw };
    }
  } catch {
    /* fall through */
  }
  return { status: "invalid", data: {} };
}

function createSettingsStore(filePath: any, { log, dataFolderName }: any = {}) {
  let cache: any = {};
  let loaded = false;
  // Keys the user actually removed. Tracked separately so a write can merge
  // into the file on disk without a store that never loaded silently wiping
  // everything already saved there.
  const removed = new Set<string>();
  // When this run restored the settings from the last good copy (ms of that copy), for the one line the app shows.
  let restoredAt: number | null = null;
  // When this run found no saved settings although the person clearly had some, and could not restore them.
  let lost: "unreadable" | "missing" | null = null;
  // True when this launch found settings from an earlier version that have not been asked about "start fresh" yet.
  let startFreshPending = false;

  /**
   * Keeps a copy of a file we cannot read BEFORE anything replaces it, next to
   * the original as `settings.json.corrupt-<hash>`. Named by content hash, so
   * preserving the same bytes twice is a no-op and different bytes never
   * collide. Returns true when a copy exists on disk afterwards.
   */
  function preserve(bytes: any) {
    try {
      const hash = crypto.createHash("sha256").update(bytes).digest("hex").slice(0, 10);
      const dest = `${filePath}.corrupt-${hash}`;
      if (!fs.existsSync(dest)) {
        fs.writeFileSync(dest, bytes);
        if (log) log(`settings.json could not be parsed; original kept at ${dest}`);
      }
      return true;
    } catch (err: unknown) {
      console.error("[electron] could not preserve unreadable settings:", err);
      return false;
    }
  }

  /**
   * Reads the file. A file that is present but unparseable is preserved first
   * and reported as { ok:false } if that copy could not be made, so no caller
   * can overwrite it unprotected.
   */
  function readFileChecked() {
    let bytes;
    try {
      bytes = fs.readFileSync(filePath);
    } catch (err: any) {
      if (err && err.code === "ENOENT") {
        // Deleted (antivirus, a cleaner, a mistake): the last good copy is what the person had.
        const good = readBackup();
        if (good) return { ok: true, data: good.data, fromFile: false, restoredAt: good.at };
        return { ok: true, data: {}, fromFile: false };
      }
      // Present but unreadable (permissions, a directory...): do not claim it
      // is empty, and do not write over it.
      return { ok: false, data: {}, fromFile: false };
    }
    const parsed = parseSettingsText(bytes.toString("utf8"));
    if (parsed.status === "ok" && (hasUserData(parsed.data) || (parsed.data as any)[WRITTEN_KEY])) return { ok: true, data: parsed.data, fromFile: true };
    // Unreadable, emptied, `{}` or only keys this app does not know: the last good copy is what the person had.
    const good = readBackup();
    if (parsed.status === "ok") {
      if (good) {
        // Keep what was there (it may hold keys of a newer version), then use the good copy.
        if (Object.keys(parsed.data).length > 0) preserve(bytes);
        return { ok: true, data: good.data, fromFile: false, restoredAt: good.at };
      }
      return { ok: true, data: parsed.data, fromFile: true };
    }
    if (parsed.status === "invalid") {
      const kept = preserve(bytes);
      if (good) return { ok: true, data: good.data, fromFile: false, restoredAt: good.at };
      return { ok: kept, data: {}, fromFile: false, unreadable: true };
    }
    if (good) return { ok: true, data: good.data, fromFile: false, restoredAt: good.at };
    return { ok: true, data: parsed.data, fromFile: true };
  }

  /** The last good copy (settings.json.bak) and when it was made, or null when there is none worth using. */
  function readBackup(): { data: any; at: number } | null {
    try {
      const bak = `${filePath}.bak`;
      const parsed = parseSettingsText(fs.readFileSync(bak, "utf8"));
      if (parsed.status !== "ok" || !hasUserData(parsed.data)) return null;
      return { data: parsed.data, at: fs.statSync(bak).mtimeMs };
    } catch {
      return null;
    }
  }

  /** A kept copy from an earlier launch, or a backup that holds nothing usable: proof the person had settings once. */
  function leftovers(): boolean {
    try {
      const dir = path.dirname(filePath);
      const base = path.basename(filePath);
      return fs.readdirSync(dir).some((n) => n === `${base}.bak` || n.startsWith(`${base}.corrupt-`));
    } catch {
      return false;
    }
  }

  function readFile() {
    return readFileChecked().data;
  }

  /** Reads the file into memory. Must run before the window is created. */
  function load() {
    const checked = readFileChecked();
    const raw = checked.data;
    cache = migrateSettings(raw, { dataFolderName });
    restoredAt = checked.restoredAt ? Math.round(checked.restoredAt) : null;
    if (checked.restoredAt) {
      if (log) log("settings.json was unreadable; restored from the last good copy");
    }
    lost = null;
    if (!restoredAt && !hasUserData(raw) && !(raw as any)[WRITTEN_KEY]) {
      const evidence = checked.unreadable ? "unreadable" : leftovers() ? "missing" : null;
      // Said once: the save below marks the file as Clipr's own, so the next launch does not repeat it.
      if (evidence) {
        lost = evidence;
        if (log && evidence === "missing") log("settings: no settings found, although there is a kept copy from before");
      }
    }
    // The one-time "start fresh" prompt: an install that already holds data (any earlier version, including data moved
    // in from the old "YouTube Clipper" folder) is asked once. A fresh install is marked at once, so data it makes
    // later never triggers the prompt.
    startFreshPending = false;
    if (!(cache as any)[START_FRESH_KEY]) {
      if (hasUserData(raw)) startFreshPending = true;
      else (cache as any)[START_FRESH_KEY] = "new-install";
    }
    removed.clear();
    loaded = true;
    // Write the migration back once, so the renderer and the file agree.
    if (checked.restoredAt || lost || JSON.stringify(raw) !== JSON.stringify(cache)) persist();
    return cache;
  }

  // Atomic write (temp file + rename) so a quit mid-write can't truncate the
  // file, and merge over whatever is on disk so a stale in-memory copy can
  // never wipe keys written by another path.
  function persist() {
    try {
      const onDisk = readFileChecked();
      // Never replace a file we could not read and could not keep a copy of.
      if (!onDisk.ok) return false;
      const merged = { ...onDisk.data, ...cache, [WRITTEN_KEY]: 1 };
      for (const key of removed) delete merged[key];
      cache = merged;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      // Keep the file as it was as the last good copy before it is replaced.
      if (onDisk.fromFile && hasUserData(onDisk.data)) {
        try {
          fs.copyFileSync(filePath, `${filePath}.bak`);
        } catch (err: unknown) {
          console.error("[electron] could not keep a copy of settings:", err);
        }
      }
      // Temp file, flushed to disk, then renamed over the real one: a power cut leaves the old file or the new one, never half.
      const tmp = `${filePath}.tmp`;
      const fd = fs.openSync(tmp, "w");
      try {
        fs.writeSync(fd, JSON.stringify(cache, null, 2));
        fs.fsyncSync(fd);
      } finally {
        fs.closeSync(fd);
      }
      fs.renameSync(tmp, filePath);
      return true;
    } catch (err: unknown) {
      console.error("[electron] failed to persist settings:", err);
      return false;
    }
  }

  function all() {
    return cache;
  }

  const listeners = new Set<(key: string, value: unknown) => void>();

  /** Calls `cb` after each successful write. Returns the way to stop listening. */
  function onChange(cb: (key: string, value: unknown) => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  }

  function set(key: unknown, value: unknown) {
    if (typeof key !== "string" || !key) return false;
    // Guard against the startup-order bug: never write from a store that has
    // not read the file yet, or the first write blanks every saved key.
    if (!loaded) load();
    // The answer is recorded: the prompt is no longer due in this run either, so a page reload cannot ask it again.
    if (key === START_FRESH_KEY) startFreshPending = false;
    if (value === null || value === undefined) {
      delete cache[key];
      removed.add(key);
    } else {
      cache[key] = value;
      removed.delete(key);
    }
    const saved = persist();
    if (saved) {
      for (const cb of listeners) {
        try {
          cb(key, value);
        } catch (err: unknown) {
          console.error("[electron] settings listener failed:", err);
        }
      }
    }
    return saved;
  }

  /** Removes many keys with one save (and one kept copy), for "start fresh". */
  function removeMany(keys: string[]) {
    if (!loaded) load();
    for (const key of keys) {
      delete cache[key];
      removed.add(key);
    }
    const saved = persist();
    if (saved) for (const key of keys) for (const cb of listeners) { try { cb(key, null); } catch { /* a listener must not stop the rest */ } }
    return saved;
  }

  return { load, all, set, removeMany, startFreshPending: () => startFreshPending, persist, onChange, restoredAt: () => restoredAt, lost: () => lost, path: filePath };
}

export {
  createSettingsStore,
  migrateSettings,
  parseSettingsText,
  siblingDataDir,
};
