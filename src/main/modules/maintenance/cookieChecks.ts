/**
 * File: cookieChecks.ts
 * Path: src/main/modules/maintenance/cookieChecks.ts
 * Description: Notices when the imported cookies.txt has run out, while the app
 *   is open.
 *
 *   There is nothing left to refresh: the file is the session, and the app has
 *   no way to renew it — the user re-exports one when it expires. What this
 *   still buys is the log line. An expired file otherwise shows up as a
 *   download that quietly comes back at 360p, hours after the expiry, with
 *   nothing in the diagnostics saying why. Read-only, and no network call.
 */
import electron from "electron";
import * as youtubeSession from "../../../../electron/youtubeSession";
import * as logger from "../../../../electron/logger";

const { app } = electron;

let cookieCheckTimer: any = null;
const COOKIE_CHECK_MS = 60 * 60 * 1000;

let lastCookieCheck = 0;
const COOKIE_CHECK_MIN_GAP_MS = 60 * 1000;

function checkCookieFile(why: string) {
  // Focus fires in bursts — alt-tab, a dialog closing, the updater toast —
  // so without a floor one window switch re-reads the file several times.
  const now = Date.now();
  if (now - lastCookieCheck < COOKIE_CHECK_MIN_GAP_MS) return;
  lastCookieCheck = now;
  youtubeSession
    .probe()
    .then((r: any) =>
      logger.log(
        "youtube",
        `cookie check (${why}) connected=${!!r.connected} source=${r.source}${
          r.expired ? " expired" : ""
        }`,
      ),
    )
    .catch((err: any) =>
      logger.log("youtube", `cookie check (${why}) failed: ${logger.describe(err)}`),
    );
}

export function startCookieChecks() {
  checkCookieFile("launch");
  if (cookieCheckTimer) clearInterval(cookieCheckTimer);
  cookieCheckTimer = setInterval(() => checkCookieFile("timer"), COOKIE_CHECK_MS);
  cookieCheckTimer.unref?.();
  app.on("browser-window-focus", () => checkCookieFile("focus"));
}

export function stopCookieChecks() {
  if (cookieCheckTimer) {
    clearInterval(cookieCheckTimer);
    cookieCheckTimer = null;
  }
}
