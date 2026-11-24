/**
 * File: toolChecks.ts
 * Path: src/main/modules/maintenance/toolChecks.ts
 * Description: A quiet check on launch for a newer yt-dlp, at most once a day. Shows nothing.
 */
import { getSettings } from "../../features/settings/services/settingsService";
import { updateTools } from "../../features/engine/services/toolUpdater";
import * as logger from "../logger/logger";

const DAY_MS = 24 * 60 * 60 * 1000;
const DELAY_MS = 60_000;
export const TOOLS_CHECKED_SETTING = "clipper.toolsCheckedAt";

/** True when a day or more has passed since the last check (or there never was one). */
export function toolCheckDue(lastCheckedAt: unknown, now: number): boolean {
  if (typeof lastCheckedAt !== "number" || !Number.isFinite(lastCheckedAt)) return true;
  return now - lastCheckedAt >= DAY_MS || lastCheckedAt > now;
}

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
