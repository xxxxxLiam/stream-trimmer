/**
 * File: editorHandlers.ts
 * Path: src/main/ipc/editorHandlers.ts
 * Description: Editor handoff (BUILD-SPEC 11c): editor:installed / probe /
 *   writeFcpxml / openWith / reveal / copyFiles / pathExists. Failures come back
 *   as { ok:false, error }; the logic is in electron/editorOpen.ts.
 */
import { IPC } from "../../common/ipc/channels";
import electron from "electron";
import {
  copyFiles,
  installedApps,
  openWithApp,
  pathExists,
  probeMedia,
  reveal,
  writeFcpxml,
} from "../features/editor/services/editorOpen";

const { ipcMain, shell } = electron;

export function registerEditorHandlers() {
  const guard = (fn: any) => async (_e: any, payload: any) => {
    try {
      return await fn(payload);
    } catch (err: any) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  };
  ipcMain.handle(IPC.editorInstalled, guard(async () => ({ ok: true, apps: installedApps() })));
  ipcMain.handle(IPC.editorProbe, guard((file: any) => probeMedia(file)));
  ipcMain.handle(IPC.editorWriteFcpxml, guard((payload: any) => writeFcpxml(payload || {})));
  ipcMain.handle(IPC.editorOpenWith, guard((payload: any) => openWithApp(payload || {})));
  ipcMain.handle(IPC.editorReveal, guard((target: any) => reveal(target, { shell })));
  ipcMain.handle(IPC.editorCopyFiles, guard((payload: any) => copyFiles(payload || {})));
  ipcMain.handle(IPC.editorPathExists, guard((target: any) => pathExists(target)));
}
