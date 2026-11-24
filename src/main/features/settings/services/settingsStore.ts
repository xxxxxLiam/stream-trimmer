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
      if (err && err.code === "ENOENT") return { ok: true, data: {} };
      // Present but unreadable (permissions, a directory...): do not claim it
      // is empty, and do not write over it.
      return { ok: false, data: {} };
    }
    const parsed = parseSettingsText(bytes.toString("utf8"));
    if (parsed.status === "invalid") {
      return { ok: preserve(bytes), data: {} };
    }
    return { ok: true, data: parsed.data };
  }

  function readFile() {
    return readFileChecked().data;
  }

  /** Reads the file into memory. Must run before the window is created. */
  function load() {
    const raw = readFile();
    cache = migrateSettings(raw, { dataFolderName });
    removed.clear();
    loaded = true;
    // Write the migration back once, so the renderer and the file agree.
    if (JSON.stringify(raw) !== JSON.stringify(cache)) persist();
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
      const merged = { ...onDisk.data, ...cache };
      for (const key of removed) delete merged[key];
      cache = merged;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
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

  return { load, all, set, persist, onChange, path: filePath };
}

export {
  createSettingsStore,
  migrateSettings,
  parseSettingsText,
  siblingDataDir,
};
