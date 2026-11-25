/**
 * File: cookieFile.ts
 * Path: src/main/features/youtube/services/cookieFile.ts
 * Description: The check on a dropped or chosen cookies.txt. Pure (no electron import) so it can
 * be tested. Returns one of four approved reasons, each with its one-sentence fix, for the Help page.
 */

import fsp from "node:fs/promises";

// The Netscape parsing itself lives in cookieState.ts, which also reads the
// sign-in's expiry out of a file. Both must agree on what counts as a
// sign-in, so there is exactly one copy of the rules.
import type { CookieCheck } from "../../../../common/types/signIn";
import {
  AUTH_COOKIES,
  isRelevantDomain,
  parseCookieRows,
} from "./cookieState";

/** The largest cookies file taken, from the picker and from a drop alike. */
export const MAX_COOKIE_BYTES = 5_000_000;

/** The site most of the file's rows belong to, as a plain host name, or "another site" when it can't be read. */
export function siteOfRows(rows: readonly { domain: unknown }[]): string {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const d = String(r.domain || "").replace(/^\./, "").toLowerCase();
    if (/^[a-z0-9][a-z0-9.-]{0,60}$/.test(d)) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  let best = "";
  for (const [d, n] of counts) if (n > (counts.get(best) ?? 0)) best = d;
  return best || "another site";
}

export type CookieFileRead =
  | { ok: true; text: string }
  | { ok: false; refusal: { ok: false; reason: "not-a-cookies-file"; message: string; fix: string; error: string } };

/**
 * Reads a cookies file the person chose, with the same size cap a dropped file has and a plain sentence for
 * each way it can fail (a folder, a missing file, a file too big, one that can't be opened). The system's own
 * error goes to `log`, never to the screen.
 */
export async function readCookieFile(sourcePath: unknown, log: (m: string) => void = () => {}): Promise<CookieFileRead> {
  const no = (message: string, fix: string): CookieFileRead => ({
    ok: false,
    refusal: { ok: false, reason: "not-a-cookies-file", message, fix, error: message },
  });
  try {
    if (typeof sourcePath !== "string" || !sourcePath) return no("No file was chosen.", "Choose the cookies.txt you exported.");
    const info = await fsp.stat(sourcePath);
    if (info.isDirectory()) return no("That is a folder, not a cookies file.", "Choose the cookies.txt file itself.");
    if (info.size > MAX_COOKIE_BYTES) return no("That file is too big to be a cookies file.", "Export only the youtube.com cookies, then choose it again.");
    return { ok: true, text: await fsp.readFile(sourcePath, "utf8") };
  } catch (err: unknown) {
    log(`cookie file read failed: ${err instanceof Error ? err.message : String(err)}`);
    if ((err as { code?: string } | null)?.code === "ENOENT") return no("That file is gone.", "Export it again as cookies.txt, then choose it.");
    return no("Clipr could not read that file.", "Check that you can open it, or export it again as cookies.txt.");
  }
}

const isYouTube = (domain: unknown) => /(^|\.)youtube\.com$/i.test(String(domain || ""));

/**
 * Checks a Netscape cookies.txt the user exported from their own browser.
 *
 * The reasons are checked in this order, and the first that applies wins:
 *   not-a-cookies-file  empty, JSON, or no tab-separated cookie rows at all
 *   wrong-site          made on google.com (or elsewhere): no youtube.com cookies
 *   signed-out          youtube.com cookies, but none carries a sign-in
 *   session-ended       a sign-in is there but every sign-in cookie is past its date
 *
 * A file whose sign-in cookies have no date (session cookies) is accepted.
 * Never throws.
 */
export function checkCookiesFile(text: unknown, now = Date.now()): CookieCheck {
  const raw = String(text || "");
  const rows = /^\s*[[{]/.test(raw) ? [] : parseCookieRows(raw);

  if (rows.length === 0) {
    return {
      ok: false,
      reason: "not-a-cookies-file",
      message: "That is not a cookies file.",
      fix: "Export it again as cookies.txt, in the Netscape format.",
    };
  }

  const relevant = rows.filter((row) => isRelevantDomain(row.domain));
  if (!rows.some((row) => isYouTube(row.domain))) {
    return {
      ok: false,
      reason: "wrong-site",
      message: `That file was made on ${siteOfRows(rows)}, not youtube.com.`,
      fix: "Open youtube.com, then export the cookies from that tab.",
    };
  }

  const auth = relevant.filter((row) => AUTH_COOKIES.includes(row.name) && row.value);
  if (auth.length === 0) {
    return {
      ok: false,
      reason: "signed-out",
      message: "You were signed out when that file was made.",
      fix: "Sign in to YouTube, then export it again.",
    };
  }

  const live = auth.some((row) => row.expiry === null || row.expiry * 1000 > now);
  if (!live) {
    return {
      ok: false,
      reason: "session-ended",
      message: "YouTube ended that session, so the file is too old.",
      fix: "Sign in to YouTube again, then export a fresh file.",
    };
  }

  return { ok: true, count: relevant.length };
}
