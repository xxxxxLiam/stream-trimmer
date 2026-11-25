/**
 * File: settingsHandlers.ts
 * Path: src/main/ipc/settingsHandlers.ts
 * Description: settings:all (synchronous snapshot, so the renderer can seed state
 *   before first paint), settings:set (known keys and sizes only), settings:restoredAt and settings:lost.
 */
import { IPC } from "../../common/ipc/channels";
import electron from "electron";
import { checkPageWrite } from "../features/settings/services/settingsKeys";
import { getSettings } from "../features/settings/services/settingsService";
import { answerStartFresh, isStartFreshPending } from "../features/settings/services/startFresh";

const { ipcMain } = electron;

export function registerSettingsHandlers() {
  // Synchronous snapshot so the renderer can seed state before first paint.
  ipcMain.on(IPC.settingsAll, (e: Electron.IpcMainEvent) => {
    const settings = getSettings();
    e.returnValue = settings ? settings.all() : {};
  });
  ipcMain.handle(IPC.settingsRestoredAt, () => {
    const at = getSettings()?.restoredAt?.();
    return typeof at === "number" ? new Date(at).toISOString() : null;
  });
  ipcMain.handle(IPC.startFreshPending, () => isStartFreshPending(getSettings()));
  ipcMain.handle(IPC.startFreshAnswer, (_e: unknown, choice: unknown) =>
    answerStartFresh(choice, getSettings(), { documentsDir: electron.app.getPath("documents") }),
  );
  ipcMain.handle(IPC.settingsLost, () => getSettings()?.lost?.() ?? null);
  ipcMain.handle(IPC.settingsSet, (_e: unknown, key: unknown, value: unknown) => {
    const settings = getSettings();
    if (!settings) return { ok: false, reason: "write-failed" };
    const check = checkPageWrite(key, value);
    if (check !== "ok") return { ok: false, reason: check };
    const ok = settings.set(key, value);
    return ok ? { ok: true } : { ok: false, reason: "write-failed" };
  });
}
