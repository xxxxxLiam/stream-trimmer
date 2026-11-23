/**
 * File: updatesService.ts
 * Path: src/main/features/updates/services/updatesService.ts
 * Description: The two update actions the renderer can ask for. Status events
 *   themselves are pushed by modules/updater/autoUpdater.ts.
 */
import electron from "electron";
import { autoUpdater } from "electron-updater";
import { interpretCheckResult } from "../../../../../electron/updateCheck";
import { releasesUrl } from "../../../../../electron/updater";
import * as logger from "../../../../../electron/logger";
import { isDev } from "../../../shared/utils/env";
import { sendUpdateStatus } from "../../../modules/updater/autoUpdater";

const { app } = electron;

export async function checkForUpdate() {
  if (isDev) return { ok: false, error: "Updates disabled in dev" };
  try {
    logger.log("updater", "manual check requested");
    const result: any = await autoUpdater.checkForUpdates();
    const outcome = interpretCheckResult(result, app.getVersion());
    if (outcome.kind === "error") {
      // The check never ran (it resolved to null): say so, never "Up to date".
      logger.log("updater", "manual check did not run");
      sendUpdateStatus({
        state: "error",
        message: outcome.message,
        url: releasesUrl(),
      });
      return { ok: false, error: outcome.message };
    }
    // checkForUpdates resolves without emitting update-not-available when
    // there is nothing new, so the caller gets told either way.
    if (outcome.kind === "none") sendUpdateStatus({ state: "none" });
    return { ok: true, version: result.updateInfo.version };
  } catch (err: any) {
    const error = err && err.message ? err.message : "Check failed";
    logger.log("updater", `manual check failed: ${error}`);
    sendUpdateStatus({ state: "error", message: error, url: releasesUrl() });
    return { ok: false, error };
  }
}

export function quitAndInstall() {
  try {
    autoUpdater.quitAndInstall();
    return { ok: true };
  } catch (err: any) {
    return {
      ok: false,
      error: err && err.message ? err.message : "Install failed",
    };
  }
}
