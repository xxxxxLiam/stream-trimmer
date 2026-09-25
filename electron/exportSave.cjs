/**
 * File: exportSave.cjs
 * Path: electron/exportSave.cjs
 * Description: Moves a finished channel export out of the engine's temp
 * directory into the user's save folder. Pure (no electron import) so the path
 * checks can be tested, in the same spirit as cookieFile.cjs.
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

// The engine writes every export into a folder named with this prefix, under
// the OS temp dir. Anything else is not something this app produced.
const EXPORT_PREFIX = "ytchan-";

/**
 * Moves `files` into `<dirPath>/<folder>`, then removes the temp folders they
 * came from.
 *
 * Only paths cross the IPC bridge, never the file contents: a whole-channel
 * export runs to hundreds of megabytes of CSV, and routing that through the
 * renderer is what used to run the app out of memory.
 *
 * The paths come back from the local engine, but are never trusted blindly —
 * a move is only performed for a file sitting directly inside a `ytchan-`
 * folder in the temp dir. Returns { ok, path } or { ok:false, error }.
 */
async function saveExportFiles({ dirPath, folder, files, tmpRoot }) {
  if (
    typeof dirPath !== "string" ||
    typeof folder !== "string" ||
    !Array.isArray(files)
  ) {
    return { ok: false, error: "Invalid save payload" };
  }
  if (files.length === 0) {
    return { ok: false, error: "Nothing to save" };
  }

  const root = fs.realpathSync(tmpRoot);
  const safeFolder = folder.replace(/[\\/]/g, "_");
  const target = path.join(dirPath, safeFolder);
  await fsp.mkdir(target, { recursive: true });

  const sourceDirs = new Set();
  for (const file of files) {
    if (!file || typeof file.name !== "string" || !file.name) {
      return { ok: false, error: "Invalid save payload" };
    }
    if (typeof file.path !== "string" || !file.path) {
      return { ok: false, error: "Invalid save payload" };
    }
    let source;
    try {
      source = fs.realpathSync(file.path);
    } catch {
      return { ok: false, error: `Missing export file: ${file.name}` };
    }
    // Compared on a path segment, not a string prefix, so a sibling folder
    // whose name merely starts with "ytchan-" outside the temp root, or a
    // nested path, cannot slip through.
    const parent = path.dirname(source);
    if (
      path.dirname(parent) !== root ||
      !path.basename(parent).startsWith(EXPORT_PREFIX)
    ) {
      return { ok: false, error: "Unexpected export location" };
    }
    sourceDirs.add(parent);

    const safeName = file.name.replace(/[\\/]/g, "_");
    const dest = path.join(target, safeName);
    try {
      await fsp.rename(source, dest);
    } catch (err) {
      // rename cannot cross devices, and the temp dir often is one.
      if (!err || err.code !== "EXDEV") throw err;
      await fsp.copyFile(source, dest);
      await fsp.rm(source, { force: true });
    }
  }

  for (const dir of sourceDirs) {
    await fsp.rm(dir, { recursive: true, force: true });
  }
  return { ok: true, path: target };
}

module.exports = { EXPORT_PREFIX, saveExportFiles };
