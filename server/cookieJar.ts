/**
 * File: cookieJar.ts
 * Path: server/cookieJar.ts
 * Description: Safe access to the canonical yt-cookies.txt for concurrent
 * yt-dlp runs.
 *
 * yt-dlp writes its cookie jar back to whatever `--cookies` file it was given
 * on EVERY run (YoutubeDL.save_cookies, from close()). That is what keeps the
 * session alive, and also why concurrent runs are dangerous: two processes
 * saving the same file at once truncate or interleave it, and the user is
 * silently signed out (back to 360p).
 *
 * The rule enforced here:
 *   - yt-dlp NEVER gets the canonical path. Every run gets a private copy in
 *     its own temp dir, so its write-back can only land on a throwaway.
 *   - At most one run at a time (the "refresher") is allowed to promote its
 *     copy. On release(true) the copy is validated, written to a temp file
 *     beside the canonical one and rename()d over it (atomic), so a crash at
 *     any point leaves either the old jar or the new one, never half of one.
 *   - release(false), a failed run, discards. A run that did not authenticate
 *     must never overwrite a good jar.
 *   - If the canonical file changed while the refresher ran (the user imported
 *     a fresh cookies.txt), the refresher's result is stale and is dropped.
 */
import { createHash, randomBytes } from "node:crypto";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export interface AcquireOptions {
  /** True for the single run allowed to promote its updated jar. */
  refresher: boolean;
  /** Override the canonical file (tests). Default: YT_CLIPPER_COOKIE_FILE. */
  canonicalPath?: string;
  /** Override where private copies live (tests). Default: os.tmpdir(). */
  tmpRoot?: string;
  /**
   * How long a refresher waits for the previous refresher before it settles
   * for a private copy. Never blocks a download indefinitely. Default 30s.
   */
  maxWaitMs?: number;
}

export type CookieOutcome =
  | "committed"
  | "discarded"
  | "skipped-changed"
  | "skipped-invalid"
  | "skipped-unchanged"
  | "error";

export interface CookieLease {
  /** Pass this to yt-dlp as `--cookies`. Always a private copy. */
  path: string;
  /**
   * Whether this lease actually holds the refresher role. False when
   * refresher:true was asked for but another refresher held it past
   * maxWaitMs, in which case release() simply discards.
   */
  refresher: boolean;
  /** Settle the lease. ok=true commits (refresher only); false discards. Never throws. */
  release: (ok: boolean) => Promise<void>;
  /** Filled in by release(). */
  outcome?: CookieOutcome;
  error?: string;
}

export class CookieJarMissingError extends Error {
  constructor(file: string) {
    super(`No cookie file at ${file}`);
    this.name = "CookieJarMissingError";
  }
}

const TMP_PREFIX = "ytcookie-";
const AUTH_COOKIES = ["SID", "__Secure-3PSID", "__Secure-1PSID"];
const STALE_MS = 60 * 60 * 1000;

/** The canonical cookie file, or null when none is configured. */
export function canonicalCookiePath(): string | null {
  return process.env.YT_CLIPPER_COOKIE_FILE || null;
}

/**
 * True when the text still carries a signed-in YouTube/Google session. Kept in
 * step with electron/cookieState.cjs (same auth cookie names and domain rule).
 */
export function jarHasSignIn(text: string): boolean {
  for (const raw of text.split(/\r?\n/)) {
    // yt-dlp writes HttpOnly cookies with a "#HttpOnly_" prefix on the domain.
    const line = raw.trim().replace(/^#HttpOnly_/, "");
    if (!line || line.startsWith("#")) continue;
    const cols = line.split("\t");
    if (cols.length < 7) continue;
    if (!/(^|\.)(youtube\.com|google\.com)$/i.test(cols[0])) continue;
    if (AUTH_COOKIES.includes(cols[5]) && cols[6]) return true;
  }
  return false;
}

// ---- single-writer mutex (FIFO) ----------------------------------------

let held = false;
const waiters: Array<() => void> = [];

/** Resolves true when the mutex is taken, false if maxWaitMs ran out first. */
function takeMutex(maxWaitMs: number): Promise<boolean> {
  if (!held) {
    held = true;
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const grant = () => {
      clearTimeout(timer);
      resolve(true); // ownership is handed over without ever unlocking
    };
    const timer = setTimeout(() => {
      const i = waiters.indexOf(grant);
      if (i >= 0) waiters.splice(i, 1);
      resolve(false);
    }, maxWaitMs);
    waiters.push(grant);
  });
}

function giveMutex(): void {
  const next = waiters.shift();
  if (next) next();
  else held = false;
}

// ---- test seam ---------------------------------------------------------

let beforeRenameHook: (() => void | Promise<void>) | null = null;
/** Tests only: runs after the temp file is written, before the rename. */
export function __setBeforeRenameHook(fn: (() => void | Promise<void>) | null): void {
  beforeRenameHook = fn;
}

// ---- helpers -----------------------------------------------------------

const hash = (buf: Buffer | string) => createHash("sha256").update(buf).digest("hex");

let swept = false;
async function sweepStale(root: string, canonical: string): Promise<void> {
  if (swept) return;
  swept = true;
  const now = Date.now();
  try {
    for (const name of await fsp.readdir(root)) {
      if (!name.startsWith(TMP_PREFIX)) continue;
      const full = path.join(root, name);
      try {
        const st = await fsp.stat(full);
        if (now - st.mtimeMs > STALE_MS) await fsp.rm(full, { recursive: true, force: true });
      } catch {
        /* another process got there first */
      }
    }
  } catch {
    /* unreadable tmp root: nothing to sweep */
  }
  try {
    const dir = path.dirname(canonical);
    const base = path.basename(canonical);
    for (const name of await fsp.readdir(dir)) {
      if (!name.startsWith(`${base}.tmp-`)) continue;
      const full = path.join(dir, name);
      const st = await fsp.stat(full).catch(() => null);
      if (st && now - st.mtimeMs > STALE_MS) await fsp.rm(full, { force: true });
    }
  } catch {
    /* ignore */
  }
}

async function readCanonical(file: string): Promise<Buffer> {
  try {
    return await fsp.readFile(file);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") throw new CookieJarMissingError(file);
    throw e;
  }
}

// ---- API ---------------------------------------------------------------

/**
 * Hands out a cookie file path for one yt-dlp run. See the file header.
 *
 * Always call `release()` in a finally block: release(true) when the run
 * authenticated and finished, release(false) otherwise.
 */
export async function acquireCookiePath(opts: AcquireOptions): Promise<CookieLease> {
  const canonical = opts.canonicalPath ?? canonicalCookiePath();
  if (!canonical) throw new CookieJarMissingError("(YT_CLIPPER_COOKIE_FILE unset)");

  let isRefresher = false;
  if (opts.refresher) {
    isRefresher = await takeMutex(opts.maxWaitMs ?? 30_000);
  }

  let dir: string | null = null;
  try {
    const root = opts.tmpRoot ?? os.tmpdir();
    void sweepStale(root, canonical);
    const original = await readCanonical(canonical);
    dir = await fsp.mkdtemp(path.join(root, TMP_PREFIX));
    const copy = path.join(dir, "cookies.txt");
    await fsp.writeFile(copy, original, { mode: 0o600 });

    const originalHash = hash(original);
    const tempDir = dir;
    let released = false;

    const lease: CookieLease = {
      path: copy,
      refresher: isRefresher,
      release: async (ok: boolean) => {
        if (released) return;
        released = true;
        let tmp: string | null = null;
        try {
          if (!ok || !isRefresher) {
            lease.outcome = "discarded";
            return;
          }
          const updated = await fsp.readFile(copy);
          if (hash(updated) === originalHash) {
            lease.outcome = "skipped-unchanged";
            return;
          }
          if (!jarHasSignIn(updated.toString("utf8"))) {
            lease.outcome = "skipped-invalid";
            return;
          }
          // The user may have imported a fresh file while this run was going.
          let now: Buffer | null = null;
          try {
            now = await fsp.readFile(canonical);
          } catch {
            now = null;
          }
          if (!now || hash(now) !== originalHash) {
            lease.outcome = "skipped-changed";
            return;
          }
          tmp = `${canonical}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
          const fh = await fsp.open(tmp, "w", 0o600);
          try {
            await fh.writeFile(updated);
            await fh.sync();
          } finally {
            await fh.close();
          }
          if (beforeRenameHook) await beforeRenameHook();
          await fsp.rename(tmp, canonical);
          tmp = null;
          try {
            await fsp.chmod(canonical, 0o600);
          } catch {
            /* best effort on Windows */
          }
          lease.outcome = "committed";
        } catch (e) {
          lease.outcome = "error";
          lease.error = e instanceof Error ? e.message : String(e);
        } finally {
          if (tmp) await fsp.rm(tmp, { force: true }).catch(() => {});
          await fsp.rm(tempDir, { recursive: true, force: true }).catch(() => {});
          if (isRefresher) giveMutex();
        }
      },
    };
    return lease;
  } catch (e) {
    if (dir) await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
    if (isRefresher) giveMutex();
    throw e;
  }
}

/** Convenience: run `fn` with a lease; commits only if fn resolves. */
export async function withCookiePath<T>(
  opts: AcquireOptions,
  fn: (cookiePath: string) => Promise<T>,
): Promise<T> {
  const lease = await acquireCookiePath(opts);
  let ok = false;
  try {
    const result = await fn(lease.path);
    ok = true;
    return result;
  } finally {
    await lease.release(ok);
  }
}

export const __TMP_PREFIX = TMP_PREFIX;
