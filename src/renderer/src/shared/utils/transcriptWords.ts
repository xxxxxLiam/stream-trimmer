/**
 * File: transcriptWords.ts
 * Path: src/renderer/src/shared/utils/transcriptWords.ts
 * Description: The words said inside time ranges (Transcript copy menu, and the bank's copy with
 *   transcript). Shared because two features read it. Pure.
 */
import type { TranscriptLine } from "./clip";

type Line = TranscriptLine;

export type TimeRange = { start: number; end: number };

/** Does a caption line overlap a used range? Zero-length lines count when their instant is inside. */
export function lineOverlaps(line: Line, r: TimeRange): boolean {
  if (line.end <= line.start) return line.start >= r.start && line.start < r.end;
  return line.start < r.end && line.end > r.start;
}

/** Sort ranges by start and join any that touch or overlap, so no words are listed twice. */
export function mergeRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = ranges.filter((r) => r.end > r.start).map((r) => ({ start: r.start, end: r.end })).sort((a, b) => a.start - b.start);
  const out: TimeRange[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.start <= last.end) last.end = Math.max(last.end, r.end);
    else out.push(r);
  }
  return out;
}

/**
 * The words said inside one time range, one caption line per row. A line that straddles an edge gives
 * only the words inside (by their times) when the captions carry word times; otherwise the whole line.
 */
function wordsInRange(lines: readonly Line[], r: TimeRange): string {
  const rows: string[] = [];
  for (const l of lines) {
    if (!lineOverlaps(l, r)) continue;
    const inside = l.start >= r.start && l.end <= r.end;
    if (!inside && l.words && l.words.length > 0) {
      const picked = l.words.filter((w) => {
        const mid = (w.start + w.end) / 2;
        return mid >= r.start && mid < r.end;
      });
      const text = picked.map((w) => w.text).join(" ").trim();
      if (text) rows.push(text);
    } else {
      const text = l.text.trim();
      if (text) rows.push(text);
    }
  }
  return rows.join("\n");
}

/**
 * The words said inside the given time ranges. Ranges are taken in time order (overlaps joined), each section's
 * lines one per row, and a blank line between sections: the gaps between them are skipped.
 */
export function wordsInRanges(lines: readonly Line[], ranges: readonly TimeRange[]): string {
  return mergeRanges(ranges)
    .map((r) => wordsInRange(lines, r))
    .filter(Boolean)
    .join("\n\n");
}
