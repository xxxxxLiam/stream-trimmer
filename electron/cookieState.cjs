/**
 * File: cookieState.cjs
 * Path: electron/cookieState.cjs
 * Description: Netscape cookies.txt parsing, and what a cookie file says about
 * the YouTube sign-in it carries — including when that sign-in runs out. Pure
 * (no electron import) so it can be tested, like cookieFile.cjs beside it.
 */

// Any one of these, with a value, means a usable signed-in YouTube session.
const AUTH_COOKIES = ["SID", "__Secure-3PSID", "__Secure-1PSID"];

// Netscape row: domain, includeSubdomains, path, secure, expiry, name, value.
const COLUMNS = 7;

/**
 * Column 5 of a Netscape row is a unix timestamp in SECONDS, except that 0
 * means a session cookie. That is "no expiry recorded", not "expired in
 * 1970" — reading it as a date would retire a perfectly good sign-in.
 * Returns seconds, or null when there is no usable expiry.
 */
function expirySeconds(raw) {
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  return Math.floor(seconds);
}

/**
 * Splits a Netscape cookies.txt into rows, dropping comments and anything
 * that is not a full tab-separated cookie line. Never throws — the input is a
 * file the user picked, so it can be anything at all.
 */
function parseCookieRows(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith("#"))
    .map((line) => line.split("\t"))
    .filter((cols) => cols.length >= COLUMNS)
    .map((cols) => ({
      domain: cols[0],
      path: cols[2],
      expiry: expirySeconds(cols[4]),
      name: cols[5],
      value: cols[6],
    }));
}

/**
 * True for youtube.com and google.com and their subdomains only. Matched on a
 * domain boundary so notyoutube.com, which merely ends in the right letters,
 * is not mistaken for the real thing.
 */
function isRelevantDomain(domain) {
  return /(^|\.)(youtube\.com|google\.com)$/i.test(String(domain || ""));
}

/** True for a row that is an auth cookie with an actual value behind it. */
function isAuthRow(row) {
  return AUTH_COOKIES.includes(row.name) && Boolean(row.value);
}

/**
 * What a cookies.txt says about the sign-in it carries.
 *
 * Returns { signedIn, expiresAt, expired, count, reason } and never throws.
 * `expiresAt` is epoch MILLISECONDS — the file records seconds, but every
 * caller compares it against Date.now() — and is null when the sign-in rests
 * entirely on session cookies, which carry no expiry to report.
 */
function readCookieFileState(text, now = Date.now()) {
  const rows = parseCookieRows(text);
  const relevant = rows.filter((row) => isRelevantDomain(row.domain));
  const auth = relevant.filter(isAuthRow);

  if (auth.length === 0) {
    return {
      signedIn: false,
      expiresAt: null,
      expired: false,
      count: relevant.length,
      reason:
        rows.length === 0
          ? "No cookies in that file."
          : relevant.length === 0
            ? "No YouTube or Google cookies in that file."
            : "Those YouTube cookies carry no sign-in.",
    };
  }

  // A sign-in made of several cookies lasts as long as its longest-lived one,
  // so the max wins. Session cookies contribute no date at all rather than a
  // zero that would drag the whole thing into the past.
  const dated = auth.map((row) => row.expiry).filter((seconds) => seconds !== null);
  const expiresAt = dated.length > 0 ? Math.max(...dated) * 1000 : null;
  const expired = expiresAt !== null && expiresAt <= now;

  return {
    signedIn: !expired,
    expiresAt,
    expired,
    count: relevant.length,
    reason: expired ? "That YouTube sign-in has expired." : undefined,
  };
}

/**
 * Decides whether the app is signed in to YouTube.
 *
 * The imported cookies.txt is the whole answer. This used to also consult the
 * app's own login partition and prefer it — which told every user who had
 * imported a file "not signed in" on each launch, window focus and hourly
 * refresh, because their partition was empty and always would be; yt-dlp was
 * downloading 1080p from that very file while they re-imported it for hours.
 *
 * `fileText` is the contents of the cookie file on disk, or null when there
 * is no file. Returns { connected, source, expiresAt, expired, reason }.
 */
function resolveAuthState({ fileText, now = Date.now() } = {}) {
  if (fileText == null) {
    return {
      connected: false,
      source: "none",
      expiresAt: null,
      expired: false,
      reason: "No YouTube sign-in yet.",
    };
  }

  const state = readCookieFileState(fileText, now);
  return {
    connected: state.signedIn,
    source: state.signedIn ? "imported" : "none",
    expiresAt: state.expiresAt,
    expired: state.expired,
    reason: state.signedIn ? undefined : state.reason,
  };
}

module.exports = {
  AUTH_COOKIES,
  isRelevantDomain,
  parseCookieRows,
  readCookieFileState,
  resolveAuthState,
};
