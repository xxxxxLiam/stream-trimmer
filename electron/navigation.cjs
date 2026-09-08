/**
 * File: navigation.cjs
 * Path: electron/navigation.cjs
 * Description: Navigation-outcome classification for the in-app sign-in window.
 * Pure (no electron import) so the rules can be tested directly.
 */

// Chromium's net error for "this navigation was superseded by another one".
const ERR_ABORTED = -3;

/**
 * True when a loadURL rejection only means the navigation was replaced.
 *
 * Electron rejects `loadURL` whenever a newer navigation supersedes the one in
 * flight, and Google's sign-in is a chain of redirects — so an account that is
 * ALREADY signed in aborts the original load on its way through. Treating that
 * as a failed sign-in closed the window and reported "cancelled" on every
 * attempt; the diagnostic log showed exactly this on Sept 5 and Sept 8.
 */
function isSupersededNavigation(message) {
  return /ERR_ABORTED|\(-3\)/.test(String(message || ""));
}

/** True when a did-fail-load error code is benign and must not be acted on. */
function isBenignLoadFailure(code) {
  return Number(code) === ERR_ABORTED;
}

module.exports = { ERR_ABORTED, isSupersededNavigation, isBenignLoadFailure };
