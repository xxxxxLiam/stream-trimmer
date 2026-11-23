/**
 * File: diagnosticsHandlers.ts
 * Path: src/main/ipc/diagnosticsHandlers.ts
 * Description: Surfaces the local log so a crash can be reported without hunting
 *   for a hidden folder. Every reader goes through diagnosticsService, which
 *   scrubs the text before it leaves.
 */
import electron from "electron";
import {
  copyLog,
  readDiagnostics,
  revealLog,
} from "../features/diagnostics/services/diagnosticsService";

const { clipboard, ipcMain, shell } = electron;

export function registerDiagnosticsHandlers() {
  ipcMain.handle("diagnostics:read", () => readDiagnostics());
  ipcMain.handle("diagnostics:reveal", () => revealLog(shell));
  ipcMain.handle("diagnostics:copy", () => copyLog(clipboard));
}
