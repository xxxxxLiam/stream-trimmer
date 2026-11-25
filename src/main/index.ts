/**
 * File: index.ts
 * Path: src/main/index.ts
 * Description: Electron main process — app lifecycle only. Starts one in-process
 *   Express backend on a free port, loads the built front-end, and shuts
 *   everything down cleanly on quit. No dev server ships. Everything else lives
 *   in features/, modules/ and ipc/.
 */
import electron from "electron";
import * as logger from "./modules/logger/logger";
import { registerHandlers } from "./ipc/registerHandlers";
import { flushPendingReports } from "./features/reports/services/reportService";
import { loadSettings } from "./features/settings/services/settingsService";
import { migrateLegacyUserData } from "./modules/userData/migrateLegacyUserData";
import { startBackend, stopBackend } from "./modules/engineHost/engineHost";
import { closeSplash, createSplash, createWindow, getMainWindow } from "./modules/windows/windows";
import { startSignInSignal } from "./features/youtube/services/signInService";
import { setupAutoUpdater } from "./modules/updater/autoUpdater";
import { startCookieChecks, stopCookieChecks } from "./modules/maintenance/cookieChecks";
import { startToolChecks, stopToolChecks } from "./modules/maintenance/toolChecks";
import { sweepStaleClips } from "./modules/maintenance/staleClips";

const { app } = electron;

migrateLegacyUserData();

// Single-instance lock — no duplicate backend, no duplicate window.
if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

app.on("second-instance", () => {
  const mainWindow = getMainWindow();
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  try {
    logger.installCrashHandlers();
    // Must precede startBackend(): the backend runs in this process and its
    // console output is the only record of why yt-dlp rejected a session.
    logger.captureConsole();
    // Settings and IPC must be ready BEFORE the window exists: the preload
    // reads the settings snapshot synchronously during window creation.
    loadSettings();
    registerHandlers();
    createSplash();
    const port = await startBackend();
    await createWindow(port);
    logger.watchWindow("main", getMainWindow());
    sweepStaleClips();
    startCookieChecks();
    startToolChecks();
    flushPendingReports();
    void startSignInSignal();
    setupAutoUpdater();
  } catch (err: unknown) {
    logger.log("app", `failed to start: ${logger.describe(err)}`);
    closeSplash();
    app.quit();
  }
});

app.on("window-all-closed", () => {
  // Defensive: a secondary window closing — the splash, on a slow launch —
  // has previously coincided with the whole app disappearing. If the main
  // window is still alive, this event is spurious and must not be read as
  // "the user quit".
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) {
    logger.log("app", "window-all-closed ignored — main window still alive");
    return;
  }
  logger.log("app", "window-all-closed — quitting");
  app.quit();
});

app.on("before-quit", () => {
  stopCookieChecks();
  stopToolChecks();
  stopBackend();
});
