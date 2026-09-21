/**
 * File: cookieFile.cjs
 * Path: electron/cookieFile.cjs
 * Description: Validation for an imported Netscape cookies.txt, and detection
 * of Google's embedded-browser sign-in rejection. Pure (no electron import)
 * so both can be tested.
 */

// Any one of these, with a value, means a usable signed-in YouTube session.
const AUTH_COOKIES = ["SID", "__Secure-3PSID", "__Secure-1PSID"];

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
 * Returns { ok, reason } — never throws.
 */
function validateCookieText(text) {
  const raw = String(text || "");
  if (!raw.trim()) {
    return { ok: false, reason: "That file is empty." };
  }

  const rows = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    // Netscape format: domain, includeSubdomains, path, secure, expiry, name, value
    .map((line) => line.split("\t"))
    .filter((cols) => cols.length >= 7);

  if (rows.length === 0) {
    return {
      ok: false,
      reason:
        "That doesn't look like a cookies.txt file. It should be the Netscape format, with tab-separated columns.",
    };
  }

  const relevant = rows.filter((cols) =>
    /(^|\.)(youtube\.com|google\.com)$/i.test(cols[0].replace(/^\./, ".")),
  );
  if (relevant.length === 0) {
    return {
      ok: false,
      reason:
        "No YouTube or Google cookies in that file. Export it while signed in to YouTube.",
    };
  }

  const signedIn = relevant.some(
    (cols) => AUTH_COOKIES.includes(cols[5]) && cols[6] && cols[6].length > 0,
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
