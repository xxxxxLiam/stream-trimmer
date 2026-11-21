/**
 * File: resumeCache.ts
 * Path: server/resumeCache.ts
 * Description: Keyed work folders so a failed clip download or channel export
 * can resume instead of starting over. Folders live in the OS temp dir with
 * stable, hash-derived names; nothing here ever touches a user's save folder.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

export const CLIP_PREFIX = "ytclip-";
export const EXPORT_PREFIX = "ytchan-";
const STALE_MS = 7 * 24 * 60 * 60 * 1000;

function keyHash(parts: unknown[]): string {
  return crypto
    .createHash("sha1")
    .update(parts.map((p) => String(p)).join("\u0000"))
    .digest("hex")
    .slice(0, 16);
}

/**
 * Stable work folder for a set of resume-relevant inputs. Re-running with the
 * same inputs returns the same folder (so partial data is reused); changing any
 * of them yields a different one.
 */
export function workDir(prefix: string, parts: unknown[]): string {
  const dir = path.join(os.tmpdir(), `${prefix}${keyHash(parts)}`);
  return touchDir(dir);
}

/**
 * A folder that belongs to exactly one request: the shared key's hash plus a
 * random suffix. Two requests with identical inputs never share one, so
 * neither can delete the other's in-flight files.
 */
export function jobDir(prefix: string, parts: unknown[]): string {
  const suffix = crypto.randomBytes(5).toString("hex");
  return touchDir(
    path.join(os.tmpdir(), `${prefix}${keyHash(parts)}-${suffix}`),
  );
}

function touchDir(dir: string): string {
  fs.mkdirSync(dir, { recursive: true });
  try {
    const now = new Date();
    fs.utimesSync(dir, now, now);
  } catch {
    /* mtime is only used for the staleness sweep */
  }
  return dir;
}

/** Bytes already downloaded into `.part`/`.ytdl` files inside a work folder. */
export function partialBytes(dir: string): number {
  let total = 0;
  try {
    for (const name of fs.readdirSync(dir)) {
      if (!/\.(part|ytdl)$/.test(name)) continue;
      try {
        total += fs.statSync(path.join(dir, name)).size;
      } catch {
        /* vanished mid-scan */
      }
    }
  } catch {
    /* folder gone */
  }
  return total;
}

function dirSize(dir: string): number {
  let total = 0;
  let entries: fs.Dirent[] = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return 0;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    try {
      if (entry.isDirectory()) total += dirSize(full);
      else total += fs.statSync(full).size;
    } catch {
      /* ignore */
    }
  }
  return total;
}

function cacheDirs(): string[] {
  const root = os.tmpdir();
  try {
    return fs
      .readdirSync(root)
      .filter(
        (n) => n.startsWith(CLIP_PREFIX) || n.startsWith(EXPORT_PREFIX),
      )
      .map((n) => path.join(root, n));
  } catch {
    return [];
  }
}

/**
 * What Clear would actually remove: folders a job is using, and finished clips still waiting to be
 * collected, are protected (see below) and are NOT counted, so the number the user is shown is the
 * number that goes. `protectedFolders` is how many were left out.
 */
export function cacheUsage(): { folders: number; bytes: number; protectedFolders: number } {
  let folders = 0;
  let bytes = 0;
  let protectedFolders = 0;
  for (const d of cacheDirs()) {
    if (isProtected(d)) {
      protectedFolders += 1;
      continue;
    }
    folders += 1;
    bytes += dirSize(d);
  }
  return { folders, bytes, protectedFolders };
}

// --- in-use markers --------------------------------------------------------
//
// A folder is "in use" while a job is writing into it, and for a grace period
// after a finished clip has been handed to the app (the clip's only copy lives
// there until the main process moves it). Neither Clear cache nor the stale
// sweep may remove such a folder: clearing is for abandoned partials.
//
// The registry is per process and keyed by absolute path. Anything that creates
// a work folder it keeps writing to (the clip route, the channel exporter) must
// call markInUse() and release in a finally block.

/** How long a finished clip's folder is protected after the hand-off. */
export const HANDOFF_HOLD_MS = 30 * 60 * 1000;

const inUse = new Map<string, number>();
const held = new Map<string, number>();

/** Protects `dir` until the returned function is called. Idempotent release. */
export function markInUse(dir: string): () => void {
  const key = path.resolve(dir);
  inUse.set(key, (inUse.get(key) ?? 0) + 1);
  let done = false;
  return () => {
    if (done) return;
    done = true;
    const n = (inUse.get(key) ?? 1) - 1;
    if (n <= 0) inUse.delete(key);
    else inUse.set(key, n);
  };
}

/**
 * Exclusive claim on a shared, resumable work folder: markInUse() unless a job
 * already holds it, in which case null (the caller then works in a private
 * folder rather than share `.part` files with a running download).
 */
export function tryClaim(dir: string): (() => void) | null {
  if ((inUse.get(path.resolve(dir)) ?? 0) > 0) return null;
  return markInUse(dir);
}

/** Keeps `dir` out of Clear cache for `ms` more (a finished, uncollected clip). */
export function holdFolder(dir: string, ms: number = HANDOFF_HOLD_MS): void {
  held.set(path.resolve(dir), Date.now() + ms);
}

/** Lets a held folder go early (the clip was collected). */
export function releaseHold(dir: string): void {
  held.delete(path.resolve(dir));
}

export function isProtected(dir: string): boolean {
  const key = path.resolve(dir);
  if ((inUse.get(key) ?? 0) > 0) return true;
  const until = held.get(key);
  if (until === undefined) return false;
  if (until > Date.now()) return true;
  held.delete(key);
  return false;
}

/**
 * Removes abandoned work folders. Folders a job is using, and finished clips
 * still waiting to be collected, are skipped and counted in `skipped`.
 */
export function clearCache(): { removed: number; skipped: number } {
  let removed = 0;
  let skipped = 0;
  for (const dir of cacheDirs()) {
    if (isProtected(dir)) {
      skipped += 1;
      continue;
    }
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      removed += 1;
    } catch {
      /* in use */
    }
  }
  return { removed, skipped };
}

/** Drop work folders untouched for a week. Runs once at server start. */
export function sweepStaleCache(): number {
  const cutoff = Date.now() - STALE_MS;
  let removed = 0;
  for (const dir of cacheDirs()) {
    if (isProtected(dir)) continue;
    try {
      if (fs.statSync(dir).mtimeMs > cutoff) continue;
      fs.rmSync(dir, { recursive: true, force: true });
      removed += 1;
    } catch {
      /* ignore */
    }
  }
  return removed;
}

// --- JSONL checkpoints ----------------------------------------------------

/** Append rows to a checkpoint file, one JSON object per line. */
export function appendJsonl(file: string, rows: unknown[]): void {
  if (rows.length === 0) return;
  try {
    fs.appendFileSync(
      file,
      rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
    );
  } catch {
    /* a failed checkpoint must never fail the export itself */
  }
}

/** Read a checkpoint file, skipping any trailing half-written line. */
export function readJsonl<T>(file: string): T[] {
  let raw = "";
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  const out: T[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      /* truncated final line from an interrupted write */
    }
  }
  return out;
}

export function writeJson(file: string, value: unknown): void {
  try {
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(value));
    fs.renameSync(tmp, file);
  } catch {
    /* best effort */
  }
}

export function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}
