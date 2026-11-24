/**
 * File: clipNamesHandlers.ts
 * Path: src/main/ipc/clipNamesHandlers.ts
 * Description: Suggested clip names: clipNames:prepare builds the phrase table when a transcript loads,
 *   clipNames:suggest answers for a range. Payloads are validated in the service; this only forwards.
 */
import electron from "electron";
import { IPC } from "../../common/ipc/channels";
import { prepareNames, suggestName } from "../features/engine/services/clipNames/clipNameSession";

const { ipcMain } = electron;

export function registerClipNamesHandlers() {
  ipcMain.handle(IPC.clipNamesPrepare, (_e: unknown, p: any) => prepareNames(p?.videoId, p?.lines));
  ipcMain.handle(IPC.clipNamesSuggest, (_e: unknown, p: any) => suggestName(p ?? {}));
}
