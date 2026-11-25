/**
 * File: settingsHandlers.ts
 * Path: src/main/ipc/settingsHandlers.ts
 * Description: settings:all (synchronous snapshot, so the renderer can seed state
 *   before first paint), settings:set (known keys and sizes only), and settings:restoredAt.
 */
import { IPC } from "../../common/ipc/channels";
import electron from "electron";
import { pageMayWrite } from "../features/settings/services/settingsKeys";
import { getSettings } from "../features/settings/services/settingsService";

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
  ipcMain.handle(IPC.settingsSet, (_e: unknown, key: unknown, value: unknown) => {
    const settings = getSettings();
    if (!settings) return { ok: false };
    if (!pageMayWrite(key, value)) return { ok: false };
    return { ok: settings.set(key, value) };
  });
}
