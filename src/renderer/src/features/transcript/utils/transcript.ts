/**
 * File: transcript.ts
 * Path: src/renderer/src/features/transcript/utils/transcript.ts
 * Description: Pure transcript logic (BUILD-SPEC section 6). The whole transcript stays in memory;
 *   only a small window of it is ever rendered. Time -> line lookup is a binary search, search runs
 *   over the whole transcript (including terms that span two caption lines), and ranges snap
 *   outward to whole caption lines so in/out land on sentence edges, never mid-word.
 */
import type { TranscriptLine } from "../../../shared/utils/clip";

export type Line = TranscriptLine;

/** Lines drawn at once. */
export const WINDOW_SIZE = 40;
/** The window may grow by loading earlier/later, but never past this many drawn lines. */
export const MAX_DRAWN = WINDOW_SIZE * 3;

/** Half-open window of line indices: lines[from] .. lines[to - 1]. */
export type Win = { from: number; to: number };

/**
 * Sort by start (stable) and repair impossible lines (end before start becomes zero-length).
 * Overlapping and zero-length lines are kept: captions from auto-generated VTT overlap by design.
 */
export function normalizeTranscript(raw: readonly Line[] | null | undefined): Line[] {
  if (!raw || raw.length === 0) return [];
  const out = raw.map((l) => ({
    ...l,
    start: Number.isFinite(l.start) ? l.start : 0,
    end: Number.isFinite(l.end) ? Math.max(l.end, l.start) : l.start,
    text: l.text,
  }));
  let sorted = true;
  for (let i = 1; i < out.length; i++) {
    if (out[i].start < out[i - 1].start) {
      sorted = false;
      break;
    }
  }
  if (!sorted) {
    // Array.prototype.sort is stable, so equal starts keep their original order.
    out.sort((a, b) => a.start - b.start);
  }
  return out;
}

/**
 * Index of the line "at" time t: the last line whose start is <= t (binary search, O(log n)).
 * Before the first line returns 0, after the last returns the last index, empty returns -1.
 * Expects start-sorted lines (see normalizeTranscript).
 */
export function lineIndexAt(lines: readonly Line[], t: number): number {
  const n = lines.length;
  if (n === 0) return -1;
  if (!(t > lines[0].start)) return 0;
  let lo = 0;
  let hi = n - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (lines[mid].start <= t) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

/** First index whose start is >= t (binary search). Returns n when none. */
function lowerBoundStart(lines: readonly Line[], t: number): number {
  let lo = 0;
  let hi = lines.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (lines[mid].start < t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** A window of `size` lines centred on `center`, clamped so it never runs off either end. */
export function computeWindow(total: number, center: number, size = WINDOW_SIZE): Win {
  if (total <= 0 || size <= 0) return { from: 0, to: 0 };
  if (total <= size) return { from: 0, to: total };
  const c = Math.min(Math.max(Math.round(center), 0), total - 1);
  let from = c - Math.floor(size / 2);
  from = Math.min(Math.max(from, 0), total - size);
  return { from, to: from + size };
}

/** Window around a playhead time. Touches O(log n + size) lines, never the whole transcript. */
export function windowAround(
  lines: readonly Line[],
  t: number,
  size = WINDOW_SIZE,
): Win {
  return computeWindow(lines.length, lineIndexAt(lines, t), size);
}

/**
 * Follow the playhead without churning: keep the current window while the playhead line is
 * comfortably inside it, re-centre when it gets within `margin` lines of an edge (or leaves).
 * An edge that already touches the start/end of the transcript never forces a move.
 */
export function followWindow(
  win: Win,
  total: number,
  index: number,
  size = WINDOW_SIZE,
  margin = 8,
): Win {
  if (total <= 0 || index < 0) return { from: 0, to: 0 };
  const valid = win.to > win.from && win.from >= 0 && win.to <= total;
  if (!valid) return computeWindow(total, index, size);
  const nearTop = win.from > 0 && index < win.from + margin;
  const nearBottom = win.to < total && index >= win.to - margin;
  if (index >= win.from && index < win.to && !nearTop && !nearBottom) return win;
  return computeWindow(total, index, size);
}

/** Grow the window upward by `size`, then trim the far end so at most `max` lines are drawn. */
export function extendEarlier(
  win: Win,
  total: number,
  size = WINDOW_SIZE,
  max = MAX_DRAWN,
): Win {
  const from = Math.max(0, win.from - size);
  const to = Math.min(win.to, Math.min(total, from + max));
  return { from, to };
}

/** Grow the window downward by `size`, then trim the far (top) end to at most `max` lines. */
export function extendLater(
  win: Win,
  total: number,
  size = WINDOW_SIZE,
  max = MAX_DRAWN,
): Win {
  const to = Math.min(total, win.to + size);
  const from = Math.max(win.from, Math.max(0, to - max));
  return { from, to };
}

// --------------------------------------------------------------------------------------------
// Search
// --------------------------------------------------------------------------------------------

/** One occurrence. `line` is where it starts, `endLine` where it ends (differs for two-line hits). */
export type Match = { line: number; endLine: number };

function normalizeQuery(q: string): string {
  return q.trim().replace(/\s+/g, " ").toLowerCase();
}

/**
 * Search the ENTIRE transcript. Case-insensitive, whitespace-insensitive. Lines are joined with a
 * single space so a phrase that wraps across two caption lines still matches; each occurrence is
 * reported once, at the line it starts on. Occurrences do not overlap.
 */
export function searchTranscript(lines: readonly Line[], query: string): Match[] {
  const q = normalizeQuery(query);
  if (!q || lines.length === 0) return [];
  // Collapse whitespace per line so wrapped captions and doubled spaces cannot hide a hit.
  const parts: string[] = [];
  const starts: number[] = [];
  let joined = "";
  for (let i = 0; i < lines.length; i++) {
    const text = lines[i].text.replace(/\s+/g, " ").trim().toLowerCase();
    if (text === "") continue; // empty caption lines must not add a stray separator
    if (joined !== "") joined += " ";
    starts.push(joined.length);
    parts.push(String(i));
    joined += text;
  }
  const out: Match[] = [];
  if (joined === "") return out;
  // starts[k] is the offset where non-empty line parts[k] begins; map offsets back to line index.
  const lineAt = (offset: number): number => {
    let lo = 0;
    let hi = starts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (starts[mid] <= offset) lo = mid;
      else hi = mid - 1;
    }
    return Number(parts[lo]);
  };
  let from = 0;
  for (;;) {
    const at = joined.indexOf(q, from);
    if (at < 0) break;
    out.push({ line: lineAt(at), endLine: lineAt(at + q.length - 1) });
    from = at + q.length;
  }
  return out;
}

/** `3/9`. Active is zero-based. No query -> empty string; query with no hits -> `0/0`. */
export function formatMatchCounter(active: number, total: number): string {
  if (total <= 0) return "0/0";
  const a = Math.min(Math.max(active, 0), total - 1);
  return `${a + 1}/${total}`;
}

/** Next/previous match index with wrap-around. -1 when there are no matches. */
export function stepMatch(active: number, total: number, delta: 1 | -1): number {
  if (total <= 0) return -1;
  return (((active + delta) % total) + total) % total;
}

// --------------------------------------------------------------------------------------------
// Ranges
// --------------------------------------------------------------------------------------------

export type LineRange = { start: number; end: number; first: number; last: number };

/** Snap by line index (used while dragging). Order of a and b does not matter. */
export function snapRangeByIndex(
  lines: readonly Line[],
  a: number,
  b: number,
): LineRange | null {
  const n = lines.length;
  if (n === 0) return null;
  const first = Math.min(Math.max(Math.min(a, b), 0), n - 1);
  const last = Math.min(Math.max(Math.max(a, b), 0), n - 1);
  let start = lines[first].start;
  let end = lines[first].end;
  for (let i = first; i <= last; i++) {
    if (lines[i].start < start) start = lines[i].start;
    if (lines[i].end > end) end = lines[i].end;
  }
  return { start, end, first, last };
}

/**
 * Snap an arbitrary time range OUTWARD to whole caption lines: the result always covers [a, b].
 * Start goes to the start of the line at `a`; end goes to the end of the line containing `b`
 * (if `b` falls in a gap after a line, the next line is included). a > b is swapped; a === b
 * snaps to the single line at that time. Empty transcript -> null.
 */
export function snapRange(lines: readonly Line[], a: number, b: number): LineRange | null {
  const n = lines.length;
  if (n === 0) return null;
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  const first = lineIndexAt(lines, lo);
  let last: number;
  if (hi <= lo) {
    last = first;
  } else {
    // Last line that starts strictly before `hi`; at least `first`.
    last = Math.max(first, lowerBoundStart(lines, hi) - 1);
    if (lines[last].end < hi && last + 1 < n) last += 1;
  }
  return snapRangeByIndex(lines, first, last);
}

/**
 * The word under a point `frac` (0 to 1) of the way along a line's text, with its times. Uses the
 * cue's word times when they line up with the words of the text; otherwise spreads the line's time
 * over its characters.
 */
export function wordBoundsAt(line: Line, frac: number): { start: number; end: number } {
  const spans = [...line.text.matchAll(/\S+/g)].map((m) => ({ from: m.index ?? 0, to: (m.index ?? 0) + m[0].length }));
  if (spans.length === 0 || !(line.text.length > 0)) return { start: line.start, end: line.end };
  const pos = Math.min(1, Math.max(0, frac)) * line.text.length;
  let idx = spans.findIndex((sp) => pos < sp.to);
  if (idx < 0) idx = spans.length - 1;
  if (line.words && line.words.length === spans.length) {
    return { start: line.words[idx].start, end: line.words[idx].end };
  }
  const dur = line.end - line.start;
  return {
    start: line.start + (spans[idx].from / line.text.length) * dur,
    end: line.start + (spans[idx].to / line.text.length) * dur,
  };
}

export type LinePoint = { line: number; frac: number };

/** A drag from one point to another, snapped to the words at its ends (order does not matter). */
export function snapRangeToWords(lines: readonly Line[], a: LinePoint, b: LinePoint): { start: number; end: number } | null {
  if (lines.length === 0) return null;
  const clampLine = (n: number) => Math.min(Math.max(n, 0), lines.length - 1);
  const swap = a.line > b.line || (a.line === b.line && a.frac > b.frac);
  const lo = swap ? b : a;
  const hi = swap ? a : b;
  const start = wordBoundsAt(lines[clampLine(lo.line)], lo.frac).start;
  const end = wordBoundsAt(lines[clampLine(hi.line)], hi.frac).end;
  return end > start ? { start, end } : null;
}

export type TimeRange = { start: number; end: number };

/** Does a caption line overlap a used range? Zero-length lines count when their instant is inside. */
export function lineOverlaps(line: Line, r: TimeRange): boolean {
  if (line.end <= line.start) return line.start >= r.start && line.start < r.end;
  return line.start < r.end && line.end > r.start;
}

export function isLineUsed(line: Line, ranges: readonly TimeRange[]): boolean {
  for (const r of ranges) if (lineOverlaps(line, r)) return true;
  return false;
}

/** The whole transcript as plain text, one caption line per row. */
export function wholeTranscriptText(lines: readonly Line[]): string {
  return lines.map((l) => l.text.trim()).filter(Boolean).join("\n");
}

/** The words said inside the given time ranges, in order, one caption line per row. */
export function wordsInRanges(lines: readonly Line[], ranges: readonly TimeRange[]): string {
  const picked = lines.filter((l) => ranges.some((r) => lineOverlaps(l, r)));
  return wholeTranscriptText(picked);
}
