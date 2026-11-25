/**
 * File: markers.ts
 * Path: src/renderer/src/features/markers/utils/markers.ts
 * Description: Pure logic for the Markers list. A flag is a second in the video. Flags the user
 *   has trimmed hold a range; flags that were clipped fold away. Two or more trimmed flags form
 *   the "Both have a range" group; "Trim next flag" opens 30 seconds around the next open flag.
 */
import { lineIndexAt, type Line } from "../../transcript/utils/transcript";

export type FlagRange = { start: number; end: number };

/** What the Markers panel remembers per video, keyed by the flag's second. */
export type FlagMemory = {
  ranges: Record<string, FlagRange>;
  clipped: number[];
};

export type FlagRow = {
  at: number;
  words: string;
  range: FlagRange | null;
};

export type FlagGroups = {
  /** Flags with no range, plus a lone ranged flag (a group needs two). */
  open: FlagRow[];
  /** Two or more flags that have a range: the "Both have a range" group. */
  ranged: FlagRow[];
  clipped: FlagRow[];
};

export const TRIM_HALF_SEC = 15;

export const keyOf = (at: number): string => String(Math.round(at * 1000));

/** The words said at a second, from the transcript; empty when there is none. */
export function wordsAt(lines: readonly Line[], at: number): string {
  if (!lines.length) return "";
  const i = lineIndexAt(lines, at);
  return i >= 0 ? lines[i].text.trim() : "";
}

export function groupFlags(
  flags: readonly number[],
  mem: FlagMemory,
  lines: readonly Line[],
): FlagGroups {
  const clippedSet = new Set(mem.clipped.map(keyOf));
  const rows = [...flags]
    .sort((a, b) => a - b)
    .map((at): FlagRow => ({ at, words: wordsAt(lines, at), range: mem.ranges[keyOf(at)] ?? null }));
  const clipped = rows.filter((r) => clippedSet.has(keyOf(r.at)));
  const live = rows.filter((r) => !clippedSet.has(keyOf(r.at)));
  const withRange = live.filter((r) => r.range);
  if (withRange.length >= 2) {
    return { open: live.filter((r) => !r.range), ranged: withRange, clipped };
  }
  return { open: live, ranged: [], clipped };
}

/** The next flag with no range after the playhead, wrapping to the first; null when none is left. */
export function nextOpenFlag(groups: FlagGroups, playhead: number): FlagRow | null {
  const open = groups.open.filter((r) => !r.range);
  return open.find((r) => r.at > playhead) ?? open[0] ?? null;
}

/** 30 seconds around a flag, kept inside the video. */
export function trimWindow(at: number, duration: number | null): FlagRange {
  let start = Math.max(0, at - TRIM_HALF_SEC);
  let end = at + TRIM_HALF_SEC;
  if (duration && duration > 0 && end > duration) {
    end = duration;
    start = Math.max(0, end - 2 * TRIM_HALF_SEC);
  }
  return { start, end };
}

/** Delete and Backspace remove the focused flag row (B-9). */
export function isRemoveKey(key: string): boolean {
  return key === "Delete" || key === "Backspace";
}
