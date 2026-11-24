/**
 * File: diagnosticsHandlers.ts
 * Path: src/main/ipc/diagnosticsHandlers.ts
 * Description: Surfaces the local log so a crash can be reported without hunting
 *   for a hidden folder. Every reader goes through diagnosticsService, which
 *   scrubs the text before it leaves.
 */
import { IPC } from "../../common/ipc/channels";
import electron from "electron";
import {
  copyLog,
  readDiagnostics,
  revealLog,
} from "../features/diagnostics/services/diagnosticsService";

const { clipboard, ipcMain, shell } = electron;

export function registerDiagnosticsHandlers() {
  ipcMain.handle(IPC.diagnosticsRead, () => readDiagnostics());
  ipcMain.handle(IPC.diagnosticsReveal, () => revealLog(shell));
  ipcMain.handle(IPC.diagnosticsCopy, () => copyLog(clipboard));
}
