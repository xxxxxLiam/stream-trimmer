/**
 * File: pathSafety.cjs
 * Path: electron/pathSafety.cjs
 * Description: Pure (no electron import) helpers that keep the save handlers
 * inside the folders the user actually chose, and keep them from replacing a
 * file that is already there. Tested in electron/pathSafety.test.cjs.
 */
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const path = require("node:path");

/**
 * Resolves `p` to an absolute path and, where the path (or its nearest
 * existing ancestor) is real, follows symlinks, so a link inside a chosen
 * folder cannot lead out of it.
 */
function canonical(p) {
  const abs = path.resolve(String(p));
  const tail = [];
  let cur = abs;
  for (;;) {
    try {
      return path.join(fs.realpathSync(cur), ...tail.reverse());
    } catch {
      const parent = path.dirname(cur);
      if (parent === cur) return abs;
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}

/** True when `target` is `root` itself or somewhere beneath it. */
function isInside(root, target, { allowRoot = true } = {}) {
  const rel = path.relative(canonical(root), canonical(target));
  if (rel === "") return allowRoot;
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

/**
 * Folders the app has been told about: the ones in settings plus any the user
 * picked in this session through the native dialog.
 */
function allowedRoots(settingsObj, picked = []) {
  const s = settingsObj || {};
  const out = new Set();
  const add = (v) => {
    if (typeof v === "string" && v.trim() && path.isAbsolute(v)) out.add(v);
  };
  for (const key of ["clipper.saveDir", "clipper.clipsDir", "clipper.dataDir"]) add(s[key]);
  if (Array.isArray(s["clipper.saveDirs"])) s["clipper.saveDirs"].forEach(add);
  for (const p of picked) add(p);
  return [...out];
}

/**
 * Joins `dirPath` + `name` (a single file or folder name) and checks the
 * RESOLVED result: it must sit strictly inside `dirPath`, and `dirPath` must be
 * inside one of `roots` (when `roots` is given). Returns { ok, target } or
 * { ok:false, error }.
 */
function resolveTarget({ dirPath, name, roots }) {
  if (typeof dirPath !== "string" || !path.isAbsolute(dirPath)) {
    return { ok: false, error: "Unexpected save location" };
  }
  const safeName = String(name).replace(/[\\/]/g, "_");
  const target = path.join(dirPath, safeName);
  if (!safeName || !isInside(dirPath, target, { allowRoot: false })) {
    return { ok: false, error: "Unexpected save location" };
  }
  if (roots && !roots.some((r) => isInside(r, target, { allowRoot: false }))) {
    return { ok: false, error: "Unexpected save location" };
  }
  return { ok: true, target, name: safeName };
}

/**
 * A path the renderer may ask the OS to drag out: an existing regular file
 * inside one of the folders the app knows about. Returns the real path or null.
 */
function dragTarget(targetPath, roots) {
  if (typeof targetPath !== "string" || !path.isAbsolute(targetPath)) return null;
  try {
    const real = fs.realpathSync(targetPath);
    if (!fs.statSync(real).isFile()) return null;
    if (!roots.some((r) => isInside(r, real, { allowRoot: false }))) return null;
    return real;
  } catch {
    return null;
  }
}

/** `a.mp4` -> `a 2.mp4`, `a 3.mp4`, ... (same convention as editorOpen.cjs). */
function numberedPath(target, n) {
  const ext = path.extname(target);
  return `${target.slice(0, target.length - ext.length)} ${n}${ext}`;
}

/**
 * Creates a file at `desired` (or `desired 2`, `desired 3`, ...) without ever
 * replacing one that exists. `create(candidate)` must fail with EEXIST when the
 * candidate is taken; that is what makes this safe against a race, not an
 * existsSync check beforehand. Returns the path that was used.
 */
async function createWithoutOverwrite(desired, create) {
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? desired : numberedPath(desired, n);
    try {
      await create(candidate);
      return candidate;
    } catch (err) {
      if (!err || err.code !== "EEXIST") throw err;
    }
  }
  const err = new Error("Too many files with that name");
  err.code = "EEXIST";
  throw err;
}

/**
 * Moves `source` to `desired` without overwriting. A hard link fails with
 * EEXIST rather than replacing; where links are unavailable (another device,
 * exFAT) it falls back to an exclusive copy.
 */
async function moveWithoutOverwrite(source, desired) {
  const used = await createWithoutOverwrite(desired, async (candidate) => {
    try {
      await fsp.link(source, candidate);
    } catch (err) {
      if (!err || err.code === "EEXIST") throw err;
      await fsp.copyFile(source, candidate, fs.constants.COPYFILE_EXCL);
    }
  });
  await fsp.rm(source, { force: true });
  return used;
}

/** Writes `data` to `desired` without overwriting (flag "wx"). */
async function writeWithoutOverwrite(desired, data) {
  return createWithoutOverwrite(desired, (candidate) =>
    fsp.writeFile(candidate, data, { flag: "wx" }),
  );
}

module.exports = {
  canonical,
  isInside,
  allowedRoots,
  resolveTarget,
  dragTarget,
  numberedPath,
  moveWithoutOverwrite,
  writeWithoutOverwrite,
};
