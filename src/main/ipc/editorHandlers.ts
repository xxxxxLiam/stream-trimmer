/**
 * File: editorHandlers.ts
 * Path: src/main/ipc/editorHandlers.ts
 * Description: Editor handoff (BUILD-SPEC 11c): editor:installed / probe /
 *   writeFcpxml / openWith / reveal / copyFiles / pathExists. Failures come back
 *   as { ok:false, error }; the logic is in electron/editorOpen.ts.
 */
import { IPC } from "../../common/ipc/channels";
import electron from "electron";
import { readFcpLookFile } from "../features/editor/services/fcpLookFile";
import {
  copyFiles,
  installedApps,
  offeredEditors,
  openWithApp,
  pathExists,
  probeMedia,
  reveal,
  writeFcpxml,
} from "../features/editor/services/editorOpen";

const { ipcMain, shell } = electron;

export function registerEditorHandlers() {
  const guard = (fn: any) => async (_e: unknown, payload: unknown) => {
    try {
      return await fn(payload);
    } catch (err: any) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  };
  ipcMain.handle(IPC.editorInstalled, guard(async () => ({ ok: true, apps: installedApps(), offered: offeredEditors() })));
  ipcMain.handle(IPC.editorProbe, guard((file: unknown) => probeMedia(file)));
  ipcMain.handle(IPC.editorWriteFcpxml, guard((payload: unknown) => writeFcpxml(payload || {})));
  ipcMain.handle(IPC.editorOpenWith, guard((payload: unknown) => openWithApp(payload || {}, { showFile: (f: string) => shell.showItemInFolder(f) })));
  ipcMain.handle(IPC.editorReveal, guard((target: unknown) => reveal(target, { shell })));
  ipcMain.handle(IPC.editorCopyFiles, guard((payload: unknown) => copyFiles(payload || {})));
  // A dropped file or bundle: the renderer sends its path, main reads and checks it.
  ipcMain.handle(IPC.fcpLookRead, (_e: unknown, picked: unknown) => readFcpLookFile(picked));
  ipcMain.handle(IPC.editorPathExists, guard((target: unknown) => pathExists(target)));
}
