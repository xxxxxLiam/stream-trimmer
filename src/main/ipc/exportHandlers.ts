/**
 * File: exportHandlers.ts
 * Path: src/main/ipc/exportHandlers.ts
 * Description: export:save. The owner check and the write are in exportService;
 *   the payload is validated by saveExportFiles.
 */
import { IPC } from "../../common/ipc/channels";
import electron from "electron";
import { saveExport } from "../features/exports/services/exportService";

const { ipcMain } = electron;

export function registerExportHandlers() {
  ipcMain.handle(IPC.exportSave, (_e: unknown, payload: unknown) => saveExport(payload));
}
