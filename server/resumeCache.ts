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

export function cacheUsage(): { folders: number; bytes: number } {
  const dirs = cacheDirs();
  let bytes = 0;
  for (const d of dirs) bytes += dirSize(d);
  return { folders: dirs.length, bytes };
}

export function clearCache(): { removed: number } {
  let removed = 0;
  for (const dir of cacheDirs()) {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
      removed += 1;
    } catch {
      /* in use */
    }
  }
  return { removed };
}

/** Drop work folders untouched for a week. Runs once at server start. */
export function sweepStaleCache(): number {
  const cutoff = Date.now() - STALE_MS;
  let removed = 0;
  for (const dir of cacheDirs()) {
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
