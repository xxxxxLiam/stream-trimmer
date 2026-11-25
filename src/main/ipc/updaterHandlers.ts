/**
 * File: updaterHandlers.ts
 * Path: src/main/ipc/updaterHandlers.ts
 * Description: updater:check, updater:restartToUpdate, updater:cancelRestart, updater:restartWaitingNow, updater:readyNow. Status events are
 *   pushed from modules/updater/autoUpdater.ts, not handled here.
 */
import { IPC } from "../../common/ipc/channels";
import electron from "electron";
import { cancelRestartToUpdate, checkForUpdate, pendingUpdateReady, restartToUpdate, restartWaitingNow } from "../features/updates/services/updatesService";

const { ipcMain } = electron;

export function registerUpdaterHandlers() {
  ipcMain.handle(IPC.updaterCheck, () => checkForUpdate());
  ipcMain.handle(IPC.updaterRestartToUpdate, () => restartToUpdate());
  ipcMain.handle(IPC.updaterCancelRestart, () => cancelRestartToUpdate());
  ipcMain.handle(IPC.updaterRestartWaitingNow, () => restartWaitingNow());
  ipcMain.handle(IPC.updaterReadyNow, () => pendingUpdateReady());
}
