/**
 * File: clock.ts
 * Path: src/renderer/src/shared/utils/clock.ts
 * Description: Times as the boards write them: 1:12:09 and 8:34, no zero-padded hour.
 */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds || 0));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${Math.floor(s / 60)}:${ss}`;
}
