/**
 * File: cookies.ts
 * Path: server/services/cookies.ts
 * Description: Resolves which cookie source a run uses and leases the cookie file for it.
 */
import fs from "node:fs";
import { CookieJarMissingError, acquireCookiePath, type CookieLease } from "../cookieJar";

export function appCookieFile(): string | null {
  const target = process.env.YT_CLIPPER_COOKIE_FILE;
  if (!target) return null;
  try {
    return fs.existsSync(target) ? target : null;
  } catch {
    return null;
  }
}

export function resolveCookieOptions(
  source: string | undefined,
): Record<string, unknown> {
  if (source === "app") {
    const file = appCookieFile();
    return file ? { cookies: file } : {};
  }
  if (source) return { cookiesFromBrowser: source };
  return {};
}

/**
 * Runs `fn` with the cookie options for ONE yt-dlp run.
 *
 * yt-dlp writes its cookie jar back on every run, so a run is never given the
 * canonical file: it gets a private copy from the cookie jar module, and only
 * the single run flagged `refresher` may promote its result. A multi-segment
 * cut runs one yt-dlp per segment, so segment one is the refresher and the
 * rest are throwaway copies. The lease is released whether the run succeeds or
 * not, and a failed run is released as `false` so it can never overwrite a good
 * jar. A browser-sourced or absent session has no cookie file to protect.
 */
export async function withRunCookies<T>(
  mode: "app" | "browser" | "none",
  base: Record<string, unknown>,
  refresher: boolean,
  fn: (cookieOptions: Record<string, unknown>) => Promise<T>,
): Promise<T> {
  if (mode !== "app" || !appCookieFile()) return fn(base);
  let lease: CookieLease;
  try {
    lease = await acquireCookiePath({ refresher });
  } catch (e) {
    if (e instanceof CookieJarMissingError) {
      // The file vanished between the check and the copy. Run unsigned and let
      // the 360p-without-a-session notice say so, rather than failing the cut.
      console.warn(`[server] cookie jar unavailable: ${e.message}`);
      return fn({});
    }
    throw e;
  }
  let ok = false;
  try {
    const result = await fn({ ...base, cookies: lease.path });
    ok = true;
    return result;
  } finally {
    await lease.release(ok);
  }
}

/** Which kind of session a request asked for; only "app" has a jar to protect. */
export function cookieModeFor(source: string | undefined): "app" | "browser" | "none" {
  return !source ? "none" : source === "app" ? "app" : "browser";
}
