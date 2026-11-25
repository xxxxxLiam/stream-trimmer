/**
 * File: dayClock.ts
 * Path: src/renderer/src/shared/utils/dayClock.ts
 * Description: When the local day next changes, for anything that shows "today" (the top bar's
 *   "2 of 3 today", the end card). Pure so it can be tested without a clock.
 */

/** Milliseconds from `now` to the next local midnight (at least 1 s, so a timer never spins). */
export function msUntilMidnight(now: number = Date.now()): number {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return Math.max(1000, next.getTime() - now);
}

/** The local calendar day of `now`, as a string that changes at midnight. */
export function dayKey(now: number = Date.now()): string {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}
