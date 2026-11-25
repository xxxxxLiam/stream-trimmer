/**
 * File: freeSpace.ts
 * Path: src/renderer/src/shared/utils/freeSpace.ts
 * Description: The free-space check before a clip starts (board 03.6.2): the engine says whether the folder
 *   the clip lands in is clearly short, and the row says so with the numbers. Pure, so the wording has tests.
 */
export type RoomCheck = { ok: boolean; neededMb: number; freeMb: number | null };
export type Room = { neededMb: number; freeMb: number };

/** Only a clear shortfall with a measured number is a problem; no answer, or no measurement, never blocks a clip. */
export function roomProblem(res: RoomCheck | null | undefined): Room | null {
  if (!res || res.ok !== false || res.freeMb === null || !Number.isFinite(res.freeMb) || !Number.isFinite(res.neededMb)) return null;
  return { neededMb: res.neededMb, freeMb: res.freeMb };
}

/** "180 MB" under a gigabyte, "1.2 GB" above; the estimate is rounded because it is one. */
export function formatMb(mb: number, estimate = false): string {
  const n = Math.max(0, mb);
  if (n >= 1000) return `${(Math.round(n / 100) / 10).toString()} GB`;
  const v = estimate ? Math.max(10, Math.round(n / 10) * 10) : Math.floor(n);
  return `${v} MB`;
}

export const ROOM_REASON = "There isn’t enough space for this clip.";

export function roomDetail(room: Room): string {
  return `It needs about ${formatMb(room.neededMb, true)} and ${formatMb(room.freeMb)} is free. It waits here until it has somewhere to go.`;
}
