/**
 * File: updatesService.ts
 * Path: src/main/features/updates/services/updatesService.ts
 * Description: The two update actions the renderer can ask for. Status events
 *   themselves are pushed by modules/updater/autoUpdater.ts.
 */
import electron from "electron";
import { autoUpdater } from "electron-updater";
import { interpretCheckResult } from "../../../modules/updater/updateCheck";
import { releasesUrl } from "../../../modules/updater/updater";
import * as logger from "../../../modules/logger/logger";
import { isDev } from "../../../shared/utils/env";
import type { RestartToUpdateResult } from "../../../../common/types/updates";
import { getUpdateController, sendUpdateStatus } from "../../../modules/updater/autoUpdater";

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

/** Restarts into the update, or arms a restart that waits for the clips to finish. Never opens a dialog. */
export function restartToUpdate(): RestartToUpdateResult {
  return getUpdateController()?.restartToUpdate() ?? { ok: false, reason: "nothing-ready" };
}

export function pendingUpdateReady() {
  return getUpdateController()?.pendingReady() ?? null;
}

/** Ends a restart that is waiting for the clips to finish. */
export function cancelRestartToUpdate() {
  return { ok: true as const, cancelled: getUpdateController()?.cancelRestart() ?? false };
}

export function restartWaitingNow(): boolean {
  return getUpdateController()?.restartWaiting() ?? false;
}
