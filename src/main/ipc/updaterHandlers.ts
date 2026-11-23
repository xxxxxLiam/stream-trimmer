/**
 * File: updaterHandlers.ts
 * Path: src/main/ipc/updaterHandlers.ts
 * Description: updater:check and updater:quitAndInstall. Status events are
 *   pushed from modules/updater/autoUpdater.ts, not handled here.
 */
import electron from "electron";
import { checkForUpdate, quitAndInstall } from "../features/updates/services/updatesService";

const { ipcMain } = electron;

export function registerUpdaterHandlers() {
  ipcMain.handle("updater:check", () => checkForUpdate());
  ipcMain.handle("updater:quitAndInstall", () => quitAndInstall());
}
