/**
 * File: dialogHandlers.ts
 * Path: src/main/ipc/dialogHandlers.ts
 * Description: The native pickers: a folder, a Final Cut library, and the Final Cut look file.
 */
import { IPC } from "../../common/ipc/channels";
import path from "node:path";
import electron from "electron";
import { getMainWindow } from "../modules/windows/windows";
import { readFcpLookFile } from "../features/editor/services/fcpLookFile";
import { rememberPickedDir } from "../features/files/services/saveRoots";

const { app, dialog, ipcMain } = electron;

export function registerDialogHandlers() {
  ipcMain.handle(IPC.dialogPickDirectory, async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      title: "Choose a folder",
      properties: ["openDirectory", "createDirectory"],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    rememberPickedDir(res.filePaths[0]);
    return res.filePaths[0];
  });

  ipcMain.handle(IPC.dialogPickFcpLibrary, async () => {
    const mainWindow = getMainWindow();
    const res = await dialog.showOpenDialog(mainWindow, {
      title: "Choose your Final Cut Pro library",
      message: "Pick the library that clips should be sent to.",
      defaultPath: path.join(app.getPath("home"), "Movies"),
      // A library is a package, which macOS treats as a file, so openFile is what makes it selectable.
      properties: ["openFile", "openDirectory"],
      filters: [{ name: "Final Cut Pro Library", extensions: ["fcpbundle"] }],
    });
    if (res.canceled || res.filePaths.length === 0) return null;
    const picked = res.filePaths[0];
    if (!/\.fcpbundle$/i.test(picked)) {
      await dialog.showMessageBox(mainWindow, {
        type: "info",
        message: "That is not a Final Cut Pro library.",
        detail: "Libraries end in .fcpbundle. Pick one from your Movies folder or wherever you keep them.",
      });
      return null;
    }
    // Deliberately not added to pickedDirs: that list is where the app may write clips.
    return picked;
  });

  ipcMain.handle(IPC.fcpLookPick, async () => {
    const res = await dialog.showOpenDialog(getMainWindow(), {
      title: "Choose your Final Cut export",
      message: "Pick the project you exported with File, then Export XML.",
      // A .fcpxmld is a package, which macOS treats as a file; elsewhere only files are offered.
      properties: process.platform === "darwin" ? ["openFile", "openDirectory"] : ["openFile"],
      filters: [{ name: "Final Cut export", extensions: ["fcpxmld", "fcpxml", "txt", "xml", "rtf"] }],
    });
    if (res.canceled || res.filePaths.length === 0) return { ok: false, cancelled: true, reason: "" };
    return readFcpLookFile(res.filePaths[0]);
  });
}
