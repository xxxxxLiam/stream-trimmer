/**
 * File: editorHandlers.ts
 * Path: src/main/ipc/editorHandlers.ts
 * Description: Editor handoff (BUILD-SPEC 11c): editor:installed / probe /
 *   writeFcpxml / openWith / reveal / copyFiles / pathExists. Failures come back
 *   as { ok:false, error }; the logic is in electron/editorOpen.ts.
 */
import electron from "electron";
import {
  copyFiles,
  installedApps,
  openWithApp,
  pathExists,
  probeMedia,
  reveal,
  writeFcpxml,
} from "../../../electron/editorOpen";

const { ipcMain, shell } = electron;

export function registerEditorHandlers() {
  const guard = (fn: any) => async (_e: any, payload: any) => {
    try {
      return await fn(payload);
    } catch (err: any) {
      return { ok: false, error: err && err.message ? err.message : String(err) };
    }
  };
  ipcMain.handle("editor:installed", guard(async () => ({ ok: true, apps: installedApps() })));
  ipcMain.handle("editor:probe", guard((file: any) => probeMedia(file)));
  ipcMain.handle("editor:writeFcpxml", guard((payload: any) => writeFcpxml(payload || {})));
  ipcMain.handle("editor:openWith", guard((payload: any) => openWithApp(payload || {})));
  ipcMain.handle("editor:reveal", guard((target: any) => reveal(target, { shell })));
  ipcMain.handle("editor:copyFiles", guard((payload: any) => copyFiles(payload || {})));
  ipcMain.handle("editor:pathExists", guard((target: any) => pathExists(target)));
}
