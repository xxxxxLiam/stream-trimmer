/**
 * File: exportHandlers.ts
 * Path: src/main/ipc/exportHandlers.ts
 * Description: export:save. The owner check and the write are in exportService;
 *   the payload is validated by saveExportFiles.
 */
import electron from "electron";
import { saveExport } from "../features/exports/services/exportService";

const { ipcMain } = electron;

export function registerExportHandlers() {
  ipcMain.handle("export:save", (_e: unknown, payload: unknown) => saveExport(payload));
}
