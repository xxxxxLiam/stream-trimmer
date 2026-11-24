/**
 * File: editorOpen.ts
 * Path: src/main/features/editor/services/editorOpen.ts
 * Description: Main-process side of the editor handoff (BUILD-SPEC 11c).
 *   Probes a finished clip, writes the generated .fcpxml, opens it with a named
 *   editor (macOS `open -a`), reveals folders, and copies clips into a CapCut
 *   drop folder. Every failure returns { ok:false, error } in plain words and
 *   names what was missing; nothing here throws across the IPC bridge.
 *
 *   The pure functions take their dependencies as arguments so the failure
 *   paths can be tested without Electron or a Mac. The IPC registration lives
 *   in src/main/ipc/editorHandlers.ts.
 *
 *   CapCut has no project import, so CapCut is only ever launched or revealed;
 *   its drafts folder is never read or written.
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";

/** The only applications this module will launch. Names never come from the UI. */
type AppDef = { label: string; match: (name: string) => boolean; folder?: (name: string) => boolean };

const APPS: Record<string, AppDef> = {
  finalcut: {
    label: "Final Cut Pro",
    match: (name: string) => /^Final Cut Pro( Creator Studio| Trial)?\.app$/.test(name),
  },
  premiere: {
    label: "Adobe Premiere Pro",
    // Versioned: "Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app".
    match: (name: string) => /^Adobe Premiere Pro.*\.app$/.test(name),
    folder: (name: string) => /^Adobe Premiere Pro/.test(name),
  },
  capcut: {
    label: "CapCut",
    match: (name: string) => /^CapCut\.app$/.test(name),
  },
};

function appDirs(home: string): string[] {
  return ["/Applications", path.join(home, "Applications")];
}

function readDir(dir: string, fsImpl: Pick<typeof fs, "readdirSync">): string[] {
  try {
    return fsImpl.readdirSync(dir);
  } catch {
    return [];
  }
}

/** Highest number wins, so "2025" beats "2024" and "10" beats "9". */
function byVersionDesc(a: string, b: string): number {
  return b.localeCompare(a, undefined, { numeric: true });
}

/** Absolute path of an installed app, or null. macOS only. */
function findApp(key: string, { platform = process.platform, fsImpl = fs, home = os.homedir() } = {}) {
  const app = APPS[key];
  if (!app || platform !== "darwin") return null;
  for (const dir of appDirs(home)) {
    const names = readDir(dir, fsImpl).sort(byVersionDesc);
    for (const name of names) {
      if (app.match(name)) return path.join(dir, name);
    }
    if (app.folder) {
      for (const name of names.filter(app.folder)) {
        const inner = readDir(path.join(dir, name), fsImpl)
          .filter(app.match)
          .sort(byVersionDesc);
        if (inner.length) return path.join(dir, name, inner[0]);
      }
    }
  }
  return null;
}

function installedApps(opts?: Parameters<typeof findApp>[1]) {
  return {
    finalcut: findApp("finalcut", opts) !== null,
    premiere: findApp("premiere", opts) !== null,
    capcut: findApp("capcut", opts) !== null,
  };
}

function isAbsolutePath(p: unknown): p is string {
  return typeof p === "string" && p.length > 0 && path.isAbsolute(p);
}

/**
 * Open `file` (optional) with the named editor. `app` is a key of APPS.
 * Missing app: { ok:false, missing:"<name>", error } and the file stays put.
 */
function openWithApp(
  { app, file }: { app?: unknown; file?: unknown },
  { platform = process.platform, fsImpl = fs, home = os.homedir(), exec = execFile } = {},
) {
  const def = APPS[app as string];
  if (!def) return Promise.resolve({ ok: false, error: "That editor is not one this app can open." });
  const saved = file ? ` The file is saved at ${file}.` : "";
  if (platform !== "darwin") {
    return Promise.resolve({
      ok: false,
      error: `Opening ${def.label} from here is macOS only.${saved}`,
    });
  }
  if (file !== undefined && !isAbsolutePath(file)) {
    return Promise.resolve({ ok: false, error: "The file path is not an absolute path." });
  }
  if (file && !fsImpl.existsSync(file)) {
    return Promise.resolve({ ok: false, error: `The file is not there any more: ${file}` });
  }
  const appPath = findApp(app as string, { platform, fsImpl, home });
  if (!appPath) {
    return Promise.resolve({
      ok: false,
      missing: def.label,
      error: `${def.label} is not installed (looked in /Applications and ~/Applications).${saved}`,
    });
  }
  const args = ["-a", appPath, ...(file ? [file] : [])];
  return new Promise((resolve) => {
    exec("open", args, (err, _out, stderr) => {
      if (err) {
        const why = String(stderr || err.message || "").trim();
        resolve({ ok: false, error: `${def.label} would not open${why ? `: ${why}` : "."}${saved}` });
      } else {
        resolve({ ok: true, appPath });
      }
    });
  });
}

/** First executable `name` in the given dirs, else null. */
function resolveBinary(name: string, dirs: Array<string | null | undefined>, fsImpl = fs, platform = process.platform) {
  const file = platform === "win32" ? `${name}.exe` : name;
  for (const dir of dirs) {
    if (!dir) continue;
    const full = path.join(dir, file);
    try {
      if (fsImpl.statSync(full).isFile()) return full;
    } catch {
      /* not here */
    }
  }
  return null;
}

function binaryDirs(extra = []) {
  const sep = process.platform === "win32" ? ";" : ":";
  return [
    process.env.ELECTRON_RESOURCES_BIN,
    ...extra,
    ...(process.env.PATH || "").split(sep),
    "/opt/homebrew/bin",
    "/usr/local/bin",
  ];
}

/**
 * Probe a finished clip. Returns the raw tool output for the renderer's pure
 * parser: { ok, kind:"ffprobe", json } or { ok, kind:"ffmpeg", text }. The app
 * does not bundle ffprobe, so ffmpeg's stream summary is the fallback.
 */
function probeMedia(file: unknown, { dirs = binaryDirs(), fsImpl = fs, exec = execFile } = {}) {
  if (!isAbsolutePath(file)) {
    return Promise.resolve({ ok: false, error: "The clip path is not an absolute path." });
  }
  if (!fsImpl.existsSync(file)) {
    return Promise.resolve({ ok: false, error: `The clip file is not where it was saved: ${file}` });
  }
  const ffprobe = resolveBinary("ffprobe", dirs, fsImpl);
  const ffmpeg = resolveBinary("ffmpeg", dirs, fsImpl);
  return new Promise((resolve) => {
    if (ffprobe) {
      exec(
        ffprobe,
        ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file],
        { maxBuffer: 8 * 1024 * 1024 },
        (err, stdout, stderr) => {
          if (err) {
            resolve({ ok: false, error: `ffprobe could not read ${path.basename(file)}: ${String(stderr || err.message).trim()}` });
            return;
          }
          try {
            resolve({ ok: true, kind: "ffprobe", json: JSON.parse(stdout) });
          } catch {
            resolve({ ok: false, error: `ffprobe gave output this app cannot read for ${path.basename(file)}.` });
          }
        },
      );
    } else if (ffmpeg) {
      // `ffmpeg -i file` with no output exits non-zero by design; the stream
      // summary on stderr is what is wanted.
      exec(ffmpeg, ["-hide_banner", "-i", file], { maxBuffer: 8 * 1024 * 1024 }, (err, _stdout, stderr) => {
        const text = String(stderr || (err && err.stderr) || "");
        if (/Duration:/.test(text)) resolve({ ok: true, kind: "ffmpeg", text });
        else resolve({ ok: false, error: `ffmpeg could not read ${path.basename(file)}.` });
      });
    } else {
      resolve({
        ok: false,
        error:
          "ffprobe was not found, and neither was ffmpeg. The frame rate and size of the clip are " +
          "needed to build the editor file. Install ffmpeg (for example with Homebrew) and try again.",
      });
    }
  });
}

function safeFilename(name: unknown, ext: string): string {
  const base = path
    .basename(String(name || ""))
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "");
  const withExt = base.toLowerCase().endsWith(ext) ? base : `${base || "Clips"}${ext}`;
  return withExt;
}

/** Write the generated document into `dirPath`. Returns { ok, path }. */
async function writeFcpxml({ dirPath, filename, contents }: { dirPath?: unknown; filename?: unknown; contents?: unknown }, { fsp: fsImpl = fsp } = {}) {
  if (!isAbsolutePath(dirPath)) {
    return { ok: false, error: "Choose a folder to save the editor file in." };
  }
  if (typeof contents !== "string" || !contents.startsWith("<?xml")) {
    return { ok: false, error: "That is not an FCPXML document." };
  }
  const target = path.join(dirPath, safeFilename(filename, ".fcpxml"));
  try {
    await fsImpl.mkdir(dirPath, { recursive: true });
    await fsImpl.writeFile(target, contents, "utf8");
    return { ok: true, path: target };
  } catch (err: any) {
    return { ok: false, error: `Could not save the editor file in ${dirPath}: ${err && err.message ? err.message : err}` };
  }
}

/** A path that does not exist yet, adding " 2", " 3" before the extension. */
function uniquePath(target: string, fsImpl = fs): string {
  if (!fsImpl.existsSync(target)) return target;
  const ext = path.extname(target);
  const stem = target.slice(0, target.length - ext.length);
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${stem} ${i}${ext}`;
    if (!fsImpl.existsSync(candidate)) return candidate;
  }
  return target;
}

/** Copy finished clips into a folder (the CapCut drop folder). Never overwrites. */
async function copyFiles({ dirPath, files }: { dirPath?: unknown; files?: unknown }, { fsp: fsImpl = fsp, fsSync = fs } = {}) {
  if (!isAbsolutePath(dirPath)) {
    return { ok: false, error: "Choose a drop folder first." };
  }
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, error: "There are no clips to copy." };
  }
  try {
    await fsImpl.mkdir(dirPath, { recursive: true });
  } catch (err: any) {
    return { ok: false, error: `The drop folder cannot be used (${dirPath}): ${err && err.message ? err.message : err}` };
  }
  const copied = [];
  const failed = [];
  for (const file of files) {
    if (!isAbsolutePath(file) || !fsSync.existsSync(file)) {
      failed.push(`${file} is not there any more`);
      continue;
    }
    try {
      const dest = uniquePath(path.join(dirPath, path.basename(file)), fsSync);
      await fsImpl.copyFile(file, dest);
      copied.push(dest);
    } catch (err: any) {
      failed.push(`${path.basename(file)}: ${err && err.message ? err.message : err}`);
    }
  }
  if (copied.length === 0) return { ok: false, error: failed.join("; ") };
  return { ok: true, copied, failed };
}

/** Reveal a file in the file manager, or open a folder. */
async function reveal(target: unknown, { shell, fsImpl = fs }: any) {
  if (!isAbsolutePath(target)) return { ok: false, error: "The path is not an absolute path." };
  let stat;
  try {
    stat = fsImpl.statSync(target);
  } catch {
    return { ok: false, error: `Nothing is at ${target}. It may have been moved, renamed or on an unmounted drive.` };
  }
  if (stat.isDirectory()) {
    const failure = await shell.openPath(target);
    return failure ? { ok: false, error: failure } : { ok: true };
  }
  shell.showItemInFolder(target);
  return { ok: true };
}

/**
 * Does something exist at this absolute path, and is it a directory?
 *
 * The renderer needs this before naming a Final Cut library in an import:
 * Final Cut CREATES a library when nothing exists at the URL it is given, so a
 * typo would silently produce a stray library rather than fail. A .fcpbundle is
 * a package, which is a directory on disk, so isDirectory is the useful answer.
 */
function pathExists(target: unknown, fsImpl = fs) {
  if (!isAbsolutePath(target)) {
    return { ok: false, error: "Needs an absolute path." };
  }
  try {
    const st = fsImpl.statSync(target);
    return { ok: true, exists: true, isDirectory: st.isDirectory() };
  } catch {
    return { ok: true, exists: false, isDirectory: false };
  }
}

export {
  APPS,
  findApp,
  installedApps,
  openWithApp,
  probeMedia,
  resolveBinary,
  writeFcpxml,
  copyFiles,
  pathExists,
  reveal,
  safeFilename,
};
