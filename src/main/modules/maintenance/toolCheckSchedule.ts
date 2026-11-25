/**
 * File: toolCheckSchedule.ts
 * Path: src/main/modules/maintenance/toolCheckSchedule.ts
 * Description: When the quiet yt-dlp check on launch is due. Pure, so it can be tested.
 */
const DAY_MS = 24 * 60 * 60 * 1000;
export const TOOLS_CHECKED_SETTING = "clipper.toolsCheckedAt";

/** True when a day or more has passed since the last check (or there never was one). */
export function toolCheckDue(lastCheckedAt: unknown, now: number): boolean {
  if (typeof lastCheckedAt !== "number" || !Number.isFinite(lastCheckedAt)) return true;
  return now - lastCheckedAt >= DAY_MS || lastCheckedAt > now;
}
