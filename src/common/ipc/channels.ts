/**
 * File: channels.ts
 * Path: src/common/ipc/channels.ts
 * Description: Every IPC channel name, in one place. Main registers handlers and
 *   preload calls them by these constants, so a renamed or mistyped channel is a
 *   type error instead of a silent hang.
 */
export const IPC = {
  clipSave: "clip:save",
  diagnosticsCopy: "diagnostics:copy",
  diagnosticsRead: "diagnostics:read",
  diagnosticsReveal: "diagnostics:reveal",
  dialogPickDirectory: "dialog:pickDirectory",
  dialogPickFcpLibrary: "dialog:pickFcpLibrary",
  editorCopyFiles: "editor:copyFiles",
  editorInstalled: "editor:installed",
  editorOpenWith: "editor:openWith",
  editorPathExists: "editor:pathExists",
  editorProbe: "editor:probe",
  editorReveal: "editor:reveal",
  editorWriteFcpxml: "editor:writeFcpxml",
  exportSave: "export:save",
  fileExists: "file:exists",
  fileSave: "file:save",
  fileSaveFiles: "file:saveFiles",
  fileShowInFolder: "file:showInFolder",
  fileStartDrag: "file:startDrag",
  fileUndoClip: "file:undoClip",
  ownerCheck: "owner:check",
  settingsAll: "settings:all",
  settingsSet: "settings:set",
  shellOpenYouTubeSignIn: "shell:openYouTubeSignIn",
  systemBrowserOrder: "system:browserOrder",
  systemDefaultBrowser: "system:defaultBrowser",
  systemDefaultFolders: "system:defaultFolders",
  updaterCheck: "updater:check",
  updaterQuitAndInstall: "updater:quitAndInstall",
  updaterStatus: "updater:status",
  youtubeDisconnect: "youtube:disconnect",
  youtubeImportCookies: "youtube:importCookies",
  youtubeImportCookiesText: "youtube:importCookiesText",
  youtubeProbe: "youtube:probe",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
