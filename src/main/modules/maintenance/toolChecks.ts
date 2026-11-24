/**
 * File: toolChecks.ts
 * Path: src/main/modules/maintenance/toolChecks.ts
 * Description: A quiet check on launch for a newer yt-dlp, at most once a day. Shows nothing.
 */
import { getSettings } from "../../features/settings/services/settingsService";
import { updateTools } from "../../features/engine/services/toolUpdater";
import { TOOLS_CHECKED_SETTING, toolCheckDue } from "./toolCheckSchedule";
import * as logger from "../logger/logger";

const DELAY_MS = 60_000;

let timer: NodeJS.Timeout | null = null;

export function startToolChecks() {
  timer = setTimeout(async () => {
    const settings = getSettings();
    if (!settings || !toolCheckDue(settings.all()[TOOLS_CHECKED_SETTING], Date.now())) return;
    const result = await updateTools();
    // A failed lookup (offline) does not use up the day.
    if (result.updated || result.why === "current") settings.set(TOOLS_CHECKED_SETTING, Date.now());
    logger.log("tools", result.updated ? `yt-dlp updated to ${result.to}` : `yt-dlp check: ${result.why}${result.error ? ` (${result.error})` : ""}`);
  }, DELAY_MS);
  timer.unref?.();
}

export function stopToolChecks() {
  if (timer) clearTimeout(timer);
  timer = null;
}
