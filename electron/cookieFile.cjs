/**
 * File: cookieFile.cjs
 * Path: electron/cookieFile.cjs
 * Description: Validation for an imported Netscape cookies.txt, and detection
 * of Google's embedded-browser sign-in rejection. Pure (no electron import)
 * so both can be tested.
 */

// The Netscape parsing itself lives in cookieState.cjs, which also reads the
// sign-in's expiry out of a file. Both must agree on what counts as a
// sign-in, so there is exactly one copy of the rules.
const {
  AUTH_COOKIES,
  isRelevantDomain,
  parseCookieRows,
} = require("./cookieState.cjs");

/**
 * True when a navigation landed on Google's "Couldn't sign you in — this
 * browser or app may not be secure" page.
 *
 * Google deliberately refuses sign-in from embedded browser frameworks, and
 * an Electron window is one however it identifies itself. Without this the
 * app reports a plain "cancelled" when the user closes the blocked window,
 * which tells them nothing about what went wrong or what to do instead.
 *
 * The URL path is used rather than the page title, because the title is
 * localised and the path is not.
 */
function isSignInRejected(url) {
  const text = String(url || "");
  return (
    /\/signin\/rejected/i.test(text) || /deniedsigninrejected/i.test(text)
  );
}

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
 * readCookieFileState in cookieState.cjs is what answers that question.
 *
 * Returns { ok, reason } — never throws.
 */
function validateCookieText(text) {
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

module.exports = { AUTH_COOKIES, isSignInRejected, validateCookieText };
