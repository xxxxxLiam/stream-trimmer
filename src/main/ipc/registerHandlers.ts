/**
 * File: registerHandlers.ts
 * Path: src/main/ipc/registerHandlers.ts
 * Description: Registers every IPC channel. Called BEFORE the window exists,
 *   because the preload reads the settings snapshot synchronously while the
 *   window is being created.
 */
import { registerDialogHandlers } from "./dialogHandlers";
import { registerDiagnosticsHandlers } from "./diagnosticsHandlers";
import { registerEditorHandlers } from "./editorHandlers";
import { registerExportHandlers } from "./exportHandlers";
import { registerFilesHandlers } from "./filesHandlers";
import { registerOwnerHandlers } from "./ownerHandlers";
import { registerSettingsHandlers } from "./settingsHandlers";
import { registerSystemHandlers } from "./systemHandlers";
import { registerUpdaterHandlers } from "./updaterHandlers";
import { registerYoutubeHandlers } from "./youtubeHandlers";

export function registerHandlers() {
  registerSettingsHandlers();
  registerDialogHandlers();
  registerFilesHandlers();
  registerExportHandlers();
  registerUpdaterHandlers();
  registerYoutubeHandlers();
  registerOwnerHandlers();
  registerEditorHandlers();
  registerDiagnosticsHandlers();
  registerSystemHandlers();
}
