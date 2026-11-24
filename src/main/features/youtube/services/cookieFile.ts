/**
 * File: cookieFile.ts
 * Path: src/main/features/youtube/services/cookieFile.ts
 * Description: The check on a dropped or chosen cookies.txt. Pure (no electron import) so it can
 * be tested. Returns one of four approved reasons, each with its one-sentence fix, for the Help page.
 */

// The Netscape parsing itself lives in cookieState.ts, which also reads the
// sign-in's expiry out of a file. Both must agree on what counts as a
// sign-in, so there is exactly one copy of the rules.
import type { CookieCheck } from "../../../../common/types/signIn";
import {
  AUTH_COOKIES,
  isRelevantDomain,
  parseCookieRows,
} from "./cookieState";

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
      message: "That file was made on google.com, not youtube.com.",
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
