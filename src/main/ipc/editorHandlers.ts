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
import { checkEditorRequest, type EditorRequest } from "../features/editor/services/editorPaths";
import { recordAssetsLibraryClips, unaddedAssetsLibraryClips } from "../features/editor/services/assetsLibraryMemory";
import { saveRoots } from "../features/files/services/saveRoots";
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
      return { ok: false, error: err && err.message ? `The editor step did not finish: ${err.message}` : "The editor step did not finish." };
    }
  };
  ipcMain.handle(IPC.editorInstalled, guard(async () => ({ ok: true, apps: installedApps(), offered: offeredEditors() })));
  ipcMain.handle(IPC.editorProbe, guard((file: unknown) => probeMedia(file)));
  const checked = (kind: EditorRequest, run: (payload: unknown) => unknown) =>
    guard((payload: unknown) => {
      const verdict = checkEditorRequest(kind, payload, saveRoots());
      return verdict.ok ? run(payload) : { ok: false, error: verdict.error };
    });
  ipcMain.handle(IPC.editorWriteFcpxml, checked("writeFcpxml", (p) => writeFcpxml((p as object) || {})));
  ipcMain.handle(
    IPC.editorOpenWith,
    checked("openWith", (p) => openWithApp((p as object) || {}, { showFile: (f: string) => shell.showItemInFolder(f) })),
  );
  ipcMain.handle(IPC.editorReveal, checked("reveal", (t) => reveal(t, { shell })));
  ipcMain.handle(IPC.editorCopyFiles, checked("copyFiles", (p) => copyFiles((p as object) || {})));
  // A dropped file or bundle: the renderer sends its path, main reads and checks it.
  ipcMain.handle(IPC.fcpLookRead, (_e: unknown, picked: unknown) => readFcpLookFile(picked));
  ipcMain.handle(IPC.editorPathExists, checked("pathExists", (t) => pathExists(t)));
  // "Add to Final Cut": of these clip files, which are new to this library (not already added on an
  // earlier call), and recording the ones just added. The library path itself is whatever the native
  // picker returned; it is not a save root (nothing here writes into it), so this skips checkEditorRequest.
  ipcMain.handle(
    IPC.editorAssetsLibraryAdded,
    guard(({ library, files }: any = {}) => ({
      ok: true,
      newFiles: unaddedAssetsLibraryClips(library, Array.isArray(files) ? files.filter((f: unknown) => typeof f === "string") : []),
    })),
  );
  ipcMain.handle(
    IPC.editorAssetsLibraryRecordAdded,
    guard(({ library, files }: any = {}) => {
      recordAssetsLibraryClips(library, Array.isArray(files) ? files.filter((f: unknown) => typeof f === "string") : []);
      return { ok: true };
    }),
  );
}
