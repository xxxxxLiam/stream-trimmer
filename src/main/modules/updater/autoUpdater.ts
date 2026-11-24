/**
 * File: autoUpdater.ts
 * Path: src/main/modules/updater/autoUpdater.ts
 * Description: electron-updater wiring — free auto-updates via GitHub Releases.
 *   Reads latest.yml / latest-mac.yml / latest-linux.yml uploaded by
 *   electron-builder alongside each release's installer.
 *   NOTE: macOS auto-update requires a signed + notarized build. Until this
 *   app is signed, mac users must download new versions manually; we handle
 *   the resulting error gracefully instead of crashing.
 */
import { IPC } from "../../../common/ipc/channels";
import electron from "electron";
import { autoUpdater } from "electron-updater";
import {
  canInstallInPlace,
  downloadUrl,
  releasesUrl,
} from "./updater";
import * as logger from "../logger/logger";
import { isDev } from "../../shared/utils/env";
import { getMainWindow } from "../windows/windows";

const { dialog } = electron;

// Whether an update can be downloaded and restarted into, or only offered as
// a download. See electron/updater.ts.
export const canInstall = canInstallInPlace(process.platform);

export function sendUpdateStatus(payload: unknown) {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC.updaterStatus, payload);
  }
}

export function setupAutoUpdater() {
  if (isDev) return; // never hit GitHub during dev
  // On macOS the download is pointless — see canInstallInPlace — so the check
  // runs but nothing is fetched, and the UI offers the installer instead.
  autoUpdater.autoDownload = canInstall;
  autoUpdater.autoInstallOnAppQuit = canInstall;
  autoUpdater.logger = console;
  logger.log(
    "updater",
    `install in place: ${canInstall ? "yes" : "no (macOS is unsigned)"}`,
  );

  autoUpdater.on("checking-for-update", () => {
    console.log("[updater] checking for update");
    sendUpdateStatus({ state: "checking" });
  });
  autoUpdater.on("update-available", (info: any) => {
    const version = info && info.version;
    logger.log("updater", `update available: ${version}`);
    if (!canInstall) {
      // Nothing is downloading, so say what is actually on offer and where to
      // get it rather than showing a progress bar that will never move.
      sendUpdateStatus({
        state: "manual",
        version,
        url: downloadUrl(process.platform, version),
      });
      return;
    }
    sendUpdateStatus({ state: "available", version });
  });
  autoUpdater.on("update-not-available", () => {
    logger.log("updater", "no update available");
    sendUpdateStatus({ state: "none" });
  });
  autoUpdater.on("download-progress", (p: any) => {
    const percent = Math.round(p && p.percent ? p.percent : 0);
    sendUpdateStatus({ state: "downloading", percent });
  });
  autoUpdater.on("update-downloaded", async (info: any) => {
    console.log("[updater] update downloaded", info && info.version);
    sendUpdateStatus({ state: "ready", version: info && info.version });
    try {
      const res = await dialog.showMessageBox(getMainWindow(), {
        type: "info",
        buttons: ["Restart now", "Later"],
        defaultId: 0,
        cancelId: 1,
        title: "Update ready",
        message: `Version ${info && info.version} has been downloaded.`,
        detail: "Restart the app to apply the update.",
      });
      if (res.response === 0) autoUpdater.quitAndInstall();
    } catch (err: unknown) {
      console.error("[updater] restart dialog failed:", err);
    }
  });
  autoUpdater.on("error", (err: any) => {
    const message = (err && err.message) || String(err);
    // Logged to the diagnostics file, not just the console: "the update
    // button didn't work" is unanswerable without the actual error.
    logger.log("updater", `error: ${message}`);
    sendUpdateStatus({ state: "error", message, url: releasesUrl() });
  });

  // Fire the initial check shortly after window is ready.
  autoUpdater.checkForUpdatesAndNotify().catch((err: unknown) => {
    console.error("[updater] initial check failed:", err);
  });
}
