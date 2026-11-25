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
} from "../../youtube/services/defaultBrowser";

/**
 * Returns only the supported browser name. Cookie values remain private to
 * the browser and are read directly by the local yt-dlp process.
 */
export function defaultBrowser(app: unknown) {
  return { browser: detectDefaultBrowser(app) };
}

/**
 * Somewhere to put clips on a fresh install, so nobody has to decide before
 * their first cut. With no clips folder set, useClipperController's deliverPath gate is
 * false and the whole finished file streams through the renderer into
 * ~/Downloads instead of the main process moving it — slower, and the clips
 * scatter. The folders are created here because clip:save does not create its
 * target, and they become allowed save roots once the renderer stores them
 * (allowedRoots reads them back out of settings).
 *
 * This never overwrites a choice: the renderer only asks when nothing is set.
 */
export async function defaultFolders(app: Electron.App) {
  try {
    // Downloads/Clipr: where a downloader's files are expected. Only used when nothing is set, so a
    // folder an earlier version made under Videos (or one the person chose) is left where it is.
    const downloads = app.getPath("downloads");
    const clipsDir = path.join(downloads, "Clipr");
    const dataDir = path.join(downloads, "Clipr data");
    await fsp.mkdir(clipsDir, { recursive: true });
    await fsp.mkdir(dataDir, { recursive: true });
    return { clipsDir, dataDir };
  } catch {
    // A read-only or missing Downloads folder is not worth failing a launch over;
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
export function browserOrder(app: unknown, saved: unknown) {
  return {
    browsers: browserCheckOrder(
      detectDefaultBrowser(app),
      typeof saved === "string" ? saved : null,
    ),
  };
}
