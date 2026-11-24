/**
 * File: tabOps.ts
 * Path: src/renderer/src/shared/utils/tabOps.ts
 * Description: Pure rules for the workspace tab strip — what browsers do, written once so the
 *   provider, the strip and the tests agree. No React in here.
 */

/** Which tab becomes active when `id` closes: the one to its right, else the one to its left. */
export function activeAfterClose(ids: readonly string[], closingId: string): string | null {
  const index = ids.indexOf(closingId);
  if (index < 0) return null;
  const remaining = ids.filter((i) => i !== closingId);
  if (remaining.length === 0) return null;
  return remaining[index] ?? remaining[remaining.length - 1];
}

/**
 * Cmd/Ctrl+digit. 1..8 jump to that tab (nothing when there is no such tab), 9 always jumps to
 * the LAST tab, however many there are. Returns the index to select, or null.
 */
export function indexForDigit(digit: number, count: number): number | null {
  if (count <= 0 || !Number.isInteger(digit) || digit < 1 || digit > 9) return null;
  if (digit === 9) return count - 1;
  return digit <= count ? digit - 1 : null;
}

/** The index `delta` steps from `from`, wrapping around the ends. */
export function stepIndex(from: number, delta: number, count: number): number {
  if (count <= 0) return 0;
  return (((from + delta) % count) + count) % count;
}

/** Move the item with `id` so it ends at `toIndex` (clamped). Same array when nothing moves. */
export function moveItem<T extends { id: string }>(items: readonly T[], id: string, toIndex: number): T[] {
  const from = items.findIndex((t) => t.id === id);
  if (from < 0) return items as T[];
  const to = Math.max(0, Math.min(items.length - 1, toIndex));
  if (to === from) return items as T[];
  const next = [...items];
  const [it] = next.splice(from, 1);
  next.splice(to, 0, it);
  return next;
}

/**
 * Where a dragged tab ends up when dropped on the `before` or `after` half of tab `overIndex`.
 * The index is where the tab sits once it has been lifted out of the strip.
 */
export function dropIndex(from: number, overIndex: number, side: "before" | "after"): number {
  const raw = side === "before" ? overIndex : overIndex + 1;
  return from < raw ? raw - 1 : raw;
}

/** Whole seconds to start a re-created player at, so a suspended tab comes back where it was. */
export function resumeStart(
  saved: { videoId: string; time: number } | null,
  videoId: string,
): number {
  if (!saved || saved.videoId !== videoId) return 0;
  return Number.isFinite(saved.time) && saved.time > 0 ? Math.floor(saved.time) : 0;
}

/** A hidden tab keeps its player this long (flipping between two tabs stays instant). */
export const SUSPEND_UNLOAD_MS = 30_000;
