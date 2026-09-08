/**
 * File: settingsStore.cjs
 * Path: electron/settingsStore.cjs
 * Description: Durable JSON settings file. Pure Node (no electron import) so
 * the persistence rules can be tested directly.
 *
 * The renderer is served from a random loopback port, so localStorage is wiped
 * on every launch. Saved folders, folder names, download history and the
 * YouTube connection therefore live in a JSON file in the app's data folder.
 */
const fs = require("node:fs");
const path = require("node:path");

function createSettingsStore(filePath) {
  let cache = {};
  let loaded = false;
  // Keys the user actually removed. Tracked separately so a write can merge
  // into the file on disk without a store that never loaded silently wiping
  // everything already saved there.
  const removed = new Set();

  function readFile() {
    try {
      const raw = JSON.parse(fs.readFileSync(filePath, "utf8"));
      return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
    } catch {
      // Missing or corrupt file: start empty rather than throwing on launch.
      return {};
    }
  }

  /** Reads the file into memory. Must run before the window is created. */
  function load() {
    cache = readFile();
    removed.clear();
    loaded = true;
    return cache;
  }

  // Atomic write (temp file + rename) so a quit mid-write can't truncate the
  // file, and merge over whatever is on disk so a stale in-memory copy can
  // never wipe keys written by another path.
  function persist() {
    try {
      const merged = { ...readFile(), ...cache };
      for (const key of removed) delete merged[key];
      cache = merged;
      fs.mkdirSync(path.dirname(filePath), { recursive: true });
      const tmp = `${filePath}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(cache, null, 2));
      fs.renameSync(tmp, filePath);
      return true;
    } catch (err) {
      console.error("[electron] failed to persist settings:", err);
      return false;
    }
  }

  function all() {
    return cache;
  }

  function set(key, value) {
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
    return persist();
  }

  return { load, all, set, persist, path: filePath };
}

module.exports = { createSettingsStore };
