/**
 * File: snap.ts
 * Path: src/renderer/src/features/player/utils/snap.ts
 * Description: Snap a dragged In or Out to the nearest word boundary, so a clip never starts or ends
 *   mid-word. Only when the captions carry word times; without them nothing snaps.
 */
import type { TranscriptLine } from "../../../shared/utils/clip";

export function hasWordTimes(lines: readonly TranscriptLine[] | null | undefined): boolean {
  return !!lines && lines.some((l) => l.words && l.words.length > 0);
}

/** `edge` "start" lands on the start of the word at t (or the next one); "end" on the end of it. */
export function snapToWord(lines: readonly TranscriptLine[] | null | undefined, t: number, edge: "start" | "end"): number {
  if (!lines) return t;
  let best: { time: number; dist: number } | null = null;
  for (const line of lines) {
    if (!line.words || line.end < t - 30 || line.start > t + 30) continue;
    for (const w of line.words) {
      const inside = t >= w.start && t <= w.end;
      const time = edge === "start" ? w.start : w.end;
      const dist = inside ? 0 : Math.min(Math.abs(t - w.start), Math.abs(t - w.end));
      if (!best || dist < best.dist) best = { time, dist };
    }
  }
  return best ? best.time : t;
}
