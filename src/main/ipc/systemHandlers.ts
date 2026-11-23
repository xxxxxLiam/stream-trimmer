/**
 * File: systemHandlers.ts
 * Path: src/main/ipc/systemHandlers.ts
 * Description: Facts about this computer: default browser, the order to try
 *   browsers in, and the folders to use on a fresh install.
 */
import electron from "electron";
import {
  browserOrder,
  defaultBrowser,
  defaultFolders,
} from "../features/system/services/systemService";

const { app, ipcMain } = electron;

export function registerSystemHandlers() {
  ipcMain.handle("system:defaultBrowser", () => defaultBrowser(app));
  ipcMain.handle("system:defaultFolders", () => defaultFolders(app));
  ipcMain.handle("system:browserOrder", (_e: any, saved: any) => browserOrder(app, saved));
}
