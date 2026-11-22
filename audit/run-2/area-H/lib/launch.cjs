/**
 * File: launch.cjs
 * Path: audit/run-1/area-H/lib/launch.cjs
 * Description: Area H launcher. Wraps the shared harness launchApp() so a
 *   synthetic cookies.txt can be dropped into the fresh user-data dir BEFORE
 *   Electron starts, which is the only way the launch-time sign-in restore can
 *   succeed offline. Audit-only; no product code is read, written or patched.
 *
 *   The hook is a temporary wrapper around fs.mkdtempSync: app.cjs creates the
 *   user-data dir with it and writes settings.json straight after, so writing
 *   our extra files from inside the wrapper lands them before electron.launch.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const FAR_FUTURE = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;

/** A Netscape cookies.txt that electron/cookieState.cjs reads as a live sign-in. */
function cookiesTxt(expirySeconds = FAR_FUTURE) {
  const rows = [
    ["#HttpOnly_.youtube.com", "TRUE", "/", "TRUE", String(expirySeconds), "__Secure-3PSID", "stub-session-value"],
    [".youtube.com", "TRUE", "/", "TRUE", String(expirySeconds), "SID", "stub-sid-value"],
    [".google.com", "TRUE", "/", "TRUE", String(expirySeconds), "__Secure-1PSID", "stub-1psid-value"],
    [".youtube.com", "TRUE", "/", "FALSE", String(expirySeconds), "PREF", "f6=40000000"],
  ];
  return (
    "# Netscape HTTP Cookie File\n" +
    "# Synthetic fixture written by the area-H audit launcher.\n" +
    rows.map((r) => r.join("\t")).join("\n") +
    "\n"
  );
}

/**
 * launchApp(), plus `files`: { "<name in userData>": "<contents>" }.
 * `signedIn: true` is shorthand for a live yt-cookies.txt.
 */
async function launch(opts = {}) {
  const extra = { ...(opts.files || {}) };
  if (opts.signedIn) extra["yt-cookies.txt"] = cookiesTxt(opts.cookieExpiry);

  const real = fs.mkdtempSync;
  let dir = null;
  fs.mkdtempSync = function patched(...args) {
    const made = real.apply(fs, args);
    dir = made;
    for (const [name, body] of Object.entries(extra)) {
      fs.writeFileSync(path.join(made, name), body);
    }
    return made;
  };
  try {
    const a = await launchApp(opts);
    a.seededFiles = Object.keys(extra);
    a.userDataDirSeen = dir;
    return a;
  } finally {
    fs.mkdtempSync = real;
  }
}

module.exports = { launch, cookiesTxt, FAR_FUTURE };
