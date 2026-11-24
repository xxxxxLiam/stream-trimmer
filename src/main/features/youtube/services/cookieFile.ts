/**
 * File: cookieFile.ts
 * Path: src/main/features/youtube/services/cookieFile.ts
 * Description: Validation for an imported Netscape cookies.txt. Pure (no
 * electron import) so it can be tested.
 */

// The Netscape parsing itself lives in cookieState.ts, which also reads the
// sign-in's expiry out of a file. Both must agree on what counts as a
// sign-in, so there is exactly one copy of the rules.
import {
  AUTH_COOKIES,
  isRelevantDomain,
  parseCookieRows,
  readCookieFileState,
} from "./cookieState";

/** Why an import was refused, as a stable key the UI maps to its own sentences. */
export type CookieImportKind = "not_cookies" | "wrong_site" | "signed_out" | "too_old";

/**
 * Checks a Netscape cookies.txt the user exported from their own browser.
 *
 * This is the route that works when nothing else does: on Windows a running
 * Chrome holds an exclusive lock on its cookie database, and since Chrome 127
 * App-Bound Encryption means even a readable copy cannot be decrypted by
 * another process. Exporting from inside the browser sidesteps both, because
 * the browser does its own decryption.
 *
 * Expiry is deliberately NOT checked here: this gate decides whether a file
 * is worth adopting at all, and refusing an import outright over a date is a
 * worse outcome than adopting it and reporting it as expired afterwards —
 * readCookieFileState in cookieState.ts is what answers that question.
 *
 * Returns { ok, reason } — never throws.
 */
function validateCookieText(text: unknown) {
  const raw = String(text || "");
  if (!raw.trim()) {
    return { ok: false, reason: "That file is empty." };
  }

  const rows = parseCookieRows(raw);

  if (rows.length === 0) {
    return {
      ok: false,
      reason:
        "That doesn't look like a cookies.txt file. It should be the Netscape format, with tab-separated columns.",
    };
  }

  const relevant = rows.filter((row) => isRelevantDomain(row.domain));
  if (relevant.length === 0) {
    return {
      ok: false,
      reason:
        "No YouTube or Google cookies in that file. Export it while signed in to YouTube.",
    };
  }

  const signedIn = relevant.some(
    (row) => AUTH_COOKIES.includes(row.name) && row.value && row.value.length > 0,
  );
  if (!signedIn) {
    return {
      ok: false,
      reason:
        "That file has YouTube cookies but no sign-in. Sign in to YouTube in your browser, then export again.",
    };
  }

  return { ok: true, count: relevant.length };
}

/**
 * Decides whether an import should be refused, and why. Returns null when the file is fine to adopt.
 *
 *  - not_cookies: empty, JSON (several extensions offer it beside Netscape), or no cookie rows.
 *  - wrong_site: cookie rows, but none for youtube.com or google.com.
 *  - signed_out: YouTube cookies, but no sign-in among them.
 *  - too_old: signed in, but every sign-in cookie has already expired. Refused rather than adopted so
 *    a stale export can't replace a sign-in that still works.
 *
 * The same rules as validateCookieText, plus the expiry check that only an import needs.
 */
function checkCookieImport(text: unknown, now = Date.now()): { kind: CookieImportKind; reason: string } | null {
  const raw = String(text || "");
  if (/^\s*[\[{]/.test(raw)) {
    return {
      kind: "not_cookies",
      reason: "That file is JSON. Export it again and choose the Netscape (cookies.txt) format.",
    };
  }
  const check = validateCookieText(raw);
  if (!check.ok) {
    const rows = parseCookieRows(raw);
    const kind: CookieImportKind =
      rows.length === 0 ? "not_cookies" : !rows.some((r) => isRelevantDomain(r.domain)) ? "wrong_site" : "signed_out";
    return { kind, reason: check.reason as string };
  }
  if (readCookieFileState(raw, now).expired) {
    return { kind: "too_old", reason: "That YouTube sign-in has already expired." };
  }
  return null;
}

export { AUTH_COOKIES, validateCookieText, checkCookieImport };
