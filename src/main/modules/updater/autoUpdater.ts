/**
 * File: autoUpdater.ts
 * Path: src/main/modules/updater/autoUpdater.ts
 * Description: electron-updater wiring — free auto-updates via GitHub Releases.
 *   Reads latest.yml / latest-mac.yml / latest-linux.yml uploaded by electron-builder.
 *   Behaviour lives in updateController.ts. No dialog, no OS notification: the renderer's
 *   "Restart to update" pill (or "Get version" on the unsigned Mac build) is the only surface.
 */
import { IPC } from "../../../common/ipc/channels";
import { AUTO_UPDATE_SETTING, autoUpdateEnabled } from "../../../common/types/updates";
import { autoUpdater } from "electron-updater";
import { canInstallInPlace, downloadUrl, releasesUrl } from "./updater";
import { createUpdateController, type UpdateController } from "./updateController";
import * as logger from "../logger/logger";
import { isDev } from "../../shared/utils/env";
import { getMainWindow } from "../windows/windows";
import { getSettings } from "../../features/settings/services/settingsService";
import { activeJobCount, onActiveJobsChange } from "../../features/engine/services/downloadJobs";

export const canInstall = canInstallInPlace(process.platform);

function send(channel: string, payload: unknown) {
  const mainWindow = getMainWindow();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

export function sendUpdateStatus(payload: unknown) {
  send(IPC.updaterStatus, payload);
}

let controller: UpdateController | null = null;

/** The controller once setupAutoUpdater() has run; null in dev. */
export function getUpdateController(): UpdateController | null {
  return controller;
}

export function setupAutoUpdater() {
  if (isDev) return; // never hit GitHub during dev
  autoUpdater.logger = console;
  const settings = getSettings();
  controller = createUpdateController({
    updater: autoUpdater,
    canInstall,
    autoUpdate: () => autoUpdateEnabled(settings?.all()),
    activeClips: activeJobCount,
    sendStatus: sendUpdateStatus,
    sendReady: (payload) => send(IPC.updaterReady, payload),
    sendRestartWaiting: (waiting) => send(IPC.updaterRestartWaiting, waiting),
    downloadUrl: (version) => downloadUrl(process.platform, version),
    releasesUrl,
    log: (message) => logger.log("updater", message),
  });
  controller.attach();
  onActiveJobsChange(() => controller?.applyPolicy());
  settings?.onChange((key: string) => {
    if (key === AUTO_UPDATE_SETTING) controller?.onAutoUpdateChanged();
  });
  controller.check().catch((err: unknown) => {
    logger.log("updater", `initial check failed: ${logger.describe(err)}`);
  });
}
