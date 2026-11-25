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

import { rememberPickedDir } from "../features/files/services/saveRoots";
import { openSymbolsWindow } from "../modules/windows/symbolsWindow";
import { getMainWindow } from "../modules/windows/windows";
import { windowChrome } from "../modules/windows/windowChrome";

const { app, ipcMain } = electron;

export function registerSystemHandlers() {
  ipcMain.handle(IPC.systemDefaultBrowser, () => defaultBrowser(app));
  ipcMain.handle(IPC.systemDefaultFolders, async () => {
    const folders = await defaultFolders(app);
    // Main made these itself, so they are folders the app may save into.
    if (folders) {
      rememberPickedDir(folders.clipsDir);
      rememberPickedDir(folders.dataDir);
    }
    return folders;
  });
  ipcMain.handle(IPC.symbolsOpen, () => openSymbolsWindow());
  ipcMain.handle(IPC.windowChrome, () => {
    const win = getMainWindow();
    return windowChrome(process.platform, !!win && !win.isDestroyed() && win.isFullScreen());
  });
  ipcMain.handle(IPC.systemBrowserOrder, (_e: unknown, saved: unknown) => browserOrder(app, saved));
}
