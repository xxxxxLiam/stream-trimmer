/**
 * File: systemHandlers.ts
 * Path: src/main/ipc/systemHandlers.ts
 * Description: Facts about this computer: default browser, opening the Symbols window, the order to try
 *   browsers in, and the folders to use on a fresh install.
 */
import { IPC } from "../../common/ipc/channels";
import electron from "electron";
import {
  browserOrder,
  defaultBrowser,
  defaultFolders,
} from "../features/system/services/systemService";

import { openSymbolsWindow } from "../modules/windows/symbolsWindow";

const { app, ipcMain } = electron;

export function registerSystemHandlers() {
  ipcMain.handle(IPC.systemDefaultBrowser, () => defaultBrowser(app));
  ipcMain.handle(IPC.systemDefaultFolders, () => defaultFolders(app));
  ipcMain.handle(IPC.symbolsOpen, () => openSymbolsWindow());
  ipcMain.handle(IPC.systemBrowserOrder, (_e: unknown, saved: unknown) => browserOrder(app, saved));
}
