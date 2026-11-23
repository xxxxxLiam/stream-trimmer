/**
 * File: settingsHandlers.ts
 * Path: src/main/ipc/settingsHandlers.ts
 * Description: settings:all (synchronous snapshot, so the renderer can seed state
 *   before first paint) and settings:set.
 */
import electron from "electron";
import { getSettings } from "../features/settings/services/settingsService";

const { ipcMain } = electron;

export function registerSettingsHandlers() {
  // Synchronous snapshot so the renderer can seed state before first paint.
  ipcMain.on("settings:all", (e: any) => {
    const settings = getSettings();
    e.returnValue = settings ? settings.all() : {};
  });
  ipcMain.handle("settings:set", (_e: any, key: any, value: any) => {
    const settings = getSettings();
    if (!settings) return { ok: false };
    return { ok: settings.set(key, value) };
  });
}
