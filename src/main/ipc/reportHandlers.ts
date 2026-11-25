/**
 * File: reportHandlers.ts
 * Path: src/main/ipc/reportHandlers.ts
 * Description: report:send, the one way a crash report or a Report a problem note leaves the app.
 */
import { IPC } from "../../common/ipc/channels";
import electron from "electron";
import { sendReport } from "../features/reports/services/reportService";

const { ipcMain } = electron;

export function registerReportHandlers() {
  ipcMain.handle(IPC.reportSend, (_e: unknown, payload: unknown) => sendReport(payload));
}
