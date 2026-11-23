/**
 * File: systemService.ts
 * Path: src/main/features/system/services/systemService.ts
 * Description: Facts about this computer the renderer needs: the default browser
 *   and the folders to put clips in on a fresh install. Electron's `app` is
 *   passed in, so none of this needs Electron running to be tested.
 */
import fsp from "node:fs/promises";
import path from "node:path";
import {
  browserCheckOrder,
  detectDefaultBrowser,
} from "../../../../../electron/defaultBrowser";

/**
 * Returns only the supported browser name. Cookie values remain private to
 * the browser and are read directly by the local yt-dlp process.
 */
export function defaultBrowser(app: any) {
  return { browser: detectDefaultBrowser(app) };
}

/**
 * Somewhere to put clips on a fresh install, so nobody has to decide before
 * their first cut. With no clips folder set, useClipper's deliverPath gate is
 * false and the whole finished file streams through the renderer into
 * ~/Downloads instead of the main process moving it — slower, and the clips
 * scatter. The folders are created here because clip:save does not create its
 * target, and they become allowed save roots once the renderer stores them
 * (allowedRoots reads them back out of settings).
 *
 * This never overwrites a choice: the renderer only asks when nothing is set.
 */
export async function defaultFolders(app: any) {
  try {
    const base = path.join(app.getPath("videos"), "Clipr");
    const clipsDir = path.join(base, "Clips");
    const dataDir = path.join(base, "Data");
    await fsp.mkdir(clipsDir, { recursive: true });
    await fsp.mkdir(dataDir, { recursive: true });
    return { clipsDir, dataDir };
  } catch {
    // A read-only or missing Videos folder is not worth failing a launch over;
    // the app simply carries on with nothing set, exactly as it does today.
    return null;
  }
}

/**
 * The order to try browsers in when sweeping them all: the system default
 * first, then whichever one last worked, then the rest. Returning the order
 * rather than a single name is what lets the app check them itself instead
 * of making the user pick one at a time from a dropdown.
 */
export function browserOrder(app: any, saved: unknown) {
  return {
    browsers: browserCheckOrder(
      detectDefaultBrowser(app),
      typeof saved === "string" ? saved : null,
    ),
  };
}
