/**
 * File: filesHandlers.ts
 * Path: src/main/ipc/filesHandlers.ts
 * Description: Saving, revealing and dragging out finished files. Each handler
 *   checks the payload's shape and calls filesService; the folder confinement is
 *   in the service (saveRoots.ts, pathSafety.ts).
 */
import electron from "electron";
import { getMainWindow } from "../modules/windows/windows";
import {
  fileExists,
  saveClip,
  saveFile,
  saveFiles,
  showInFolder,
  startDrag,
} from "../features/files/services/filesService";

const { ipcMain } = electron;

export function registerFilesHandlers() {
  ipcMain.handle("clip:save", async (_e: any, payload: any) => {
    if (
      !payload ||
      typeof payload.tempPath !== "string" ||
      typeof payload.dirPath !== "string" ||
      typeof payload.filename !== "string"
    ) {
      return { ok: false, error: "Invalid save payload" };
    }
    return saveClip(payload);
  });

  ipcMain.handle("file:save", async (_e: any, payload: any) => {
    if (
      !payload ||
      typeof payload.dirPath !== "string" ||
      typeof payload.filename !== "string"
    ) {
      return { ok: false, error: "Invalid save payload" };
    }
    return saveFile(payload);
  });

  ipcMain.handle("file:saveFiles", async (_e: any, payload: any) => {
    if (
      !payload ||
      typeof payload.dirPath !== "string" ||
      typeof payload.folder !== "string" ||
      !Array.isArray(payload.files)
    ) {
      return { ok: false, error: "Invalid save payload" };
    }
    return saveFiles(payload);
  });

  ipcMain.handle("file:exists", (_e: any, targetPath: any) => fileExists(targetPath));

  // Native OS drag-out. Must be ipcMain.on (not handle): startDrag has to run
  // synchronously inside the drag gesture or the OS drops it.
  ipcMain.on("file:startDrag", (event: any, targetPath: any) => {
    try {
      // Only the app's own window, and only a real file inside the folders the
      // user chose. (The preload also refuses unless a genuine dragstart just
      // happened: calling startDrag with no gesture in progress is what wedged
      // the main process.)
      const mainWindow = getMainWindow();
      if (!mainWindow || event.sender !== mainWindow.webContents) return;
      startDrag(event.sender, targetPath);
    } catch (err: any) {
      console.error(
        "[electron] startDrag failed:",
        err && err.message ? err.message : err,
      );
    }
  });

  ipcMain.handle("file:showInFolder", (_e: any, targetPath: any) => {
    if (typeof targetPath !== "string" || !targetPath) {
      return { ok: false, error: "No path" };
    }
    return showInFolder(targetPath);
  });
}
