/**
 * File: segments.ts
 * Path: src/lib/segments.ts
 * Description: Pure model and logic for multi-segment clips (BUILD-SPEC section 4).
 *   A clip is a LIST of source-video ranges that are stitched, in list order, into one
 *   file. Everything here is seconds-based and side-effect free. Other packages import
 *   the types read-only.
 */

/** A range of the SOURCE video, in seconds. */
export type Range = { start: number; end: number };

export type Segment = Range;

export type Clip = {
  id: string;
  segments: Segment[];
  campaignId?: string;
  videoId?: string;
  label?: string;
};

/** A range already used (published) or banked, optionally naming what holds it. */
export type NamedRange = Range & { clipId?: string; label?: string };

/** The campaign length band (seconds). */
export type Band = {
  targetMinSec: number;
  targetMaxSec: number;
  hardMaxSec: number;
};

export type RangeProblem =
  | "not-a-number"
  | "negative"
  | "end-before-start"
  | "empty"
  | "past-duration";

export type RangeCheck = { ok: true } | { ok: false; reason: RangeProblem };

/** Validate one range. Pass `duration` to also reject a range past the video's end. */
export function checkRange(range: Range, duration?: number): RangeCheck {
  const { start, end } = range;
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return { ok: false, reason: "not-a-number" };
  }
  if (start < 0 || end < 0) return { ok: false, reason: "negative" };
  if (end < start) return { ok: false, reason: "end-before-start" };
  if (end === start) return { ok: false, reason: "empty" };
  if (duration != null && Number.isFinite(duration) && duration > 0 && end > duration) {
    return { ok: false, reason: "past-duration" };
  }
  return { ok: true };
}

export function describeProblem(reason: RangeProblem): string {
  switch (reason) {
    case "not-a-number":
      return "That is not a time";
    case "negative":
      return "A time cannot be before the start of the video";
    case "end-before-start":
      return "The out point is before the in point";
    case "empty":
      return "The in and out points are the same";
    case "past-duration":
      return "The out point is past the end of the video";
  }
}

/** Length of one range in seconds. An invalid or reversed range counts as 0. */
export function rangeLength(range: Range): number {
  return checkRange(range).ok ? range.end - range.start : 0;
}

export type AddResult =
  | { ok: true; segments: Segment[] }
  | { ok: false; reason: RangeProblem; segments: Segment[] };

/**
 * Append (or insert at `index`) a segment. The input list is never mutated. An invalid
 * range is refused and the list comes back unchanged, so a bad mark cannot enter a clip.
 */
export function addSegment(
  segments: readonly Segment[],
  range: Range,
  opts: { duration?: number; index?: number } = {},
): AddResult {
  const check = checkRange(range, opts.duration);
  if (!check.ok) return { ok: false, reason: check.reason, segments: [...segments] };
  const next = [...segments];
  const at =
    opts.index == null ? next.length : Math.min(Math.max(0, opts.index), next.length);
  next.splice(at, 0, { start: range.start, end: range.end });
  return { ok: true, segments: next };
}

/** Remove the segment at `index`. An index that does not exist leaves the list as is. */
export function removeSegment(segments: readonly Segment[], index: number): Segment[] {
  if (!Number.isInteger(index) || index < 0 || index >= segments.length) {
    return [...segments];
  }
  return segments.filter((_, i) => i !== index);
}

/** Move the segment at `from` so it ends up at `to` (drag to reorder). Clamped. */
export function moveSegment(
  segments: readonly Segment[],
  from: number,
  to: number,
): Segment[] {
  const next = [...segments];
  if (!Number.isInteger(from) || from < 0 || from >= next.length) return next;
  const target = Math.min(Math.max(0, Math.trunc(to)), next.length - 1);
  if (!Number.isFinite(target) || target === from) return next;
  const [item] = next.splice(from, 1);
  next.splice(target, 0, item);
  return next;
}

/** Order the segments by where they sit in the source (stitch order is otherwise list order). */
export function sortSegments(segments: readonly Segment[]): Segment[] {
  return [...segments].sort((a, b) => a.start - b.start || a.end - b.end);
}

/** Stitched length: the sum of every valid segment, whatever order they are in. */
export function totalDuration(segments: readonly Segment[]): number {
  return segments.reduce((sum, s) => sum + rangeLength(s), 0);
}

/** True when two ranges share time. Touching edges (a.end === b.start) do NOT overlap. */
export function rangesOverlap(a: Range, b: Range): boolean {
  if (!checkRange(a).ok || !checkRange(b).ok) return false;
  return a.start < b.end && b.start < a.end;
}

export type Overlap<T extends Range = NamedRange> = {
  /** The used range that was hit. */
  used: T;
  /** The shared stretch, in source seconds. */
  start: number;
  end: number;
  /** Length of the shared stretch. */
  seconds: number;
};

/**
 * Which already-used ranges does a candidate range run into? An invalid candidate
 * (end before start, empty, NaN) yields nothing: it cannot be cut, so validate it with
 * checkRange. Results keep the order of `used`.
 */
export function findOverlaps<T extends Range>(
  candidate: Range,
  used: readonly T[],
): Overlap<T>[] {
  const out: Overlap<T>[] = [];
  for (const u of used) {
    if (!rangesOverlap(candidate, u)) continue;
    const start = Math.max(candidate.start, u.start);
    const end = Math.min(candidate.end, u.end);
    out.push({ used: u, start, end, seconds: end - start });
  }
  return out;
}

export type SegmentOverlap<T extends Range = NamedRange> = {
  /** Index of the segment in the clip. */
  index: number;
  overlaps: Overlap<T>[];
};

/** Check every segment of a clip against the used ranges. Only segments that hit are listed. */
export function findSegmentOverlaps<T extends Range>(
  segments: readonly Segment[],
  used: readonly T[],
): SegmentOverlap<T>[] {
  const out: SegmentOverlap<T>[] = [];
  segments.forEach((s, index) => {
    const overlaps = findOverlaps(s, used);
    if (overlaps.length) out.push({ index, overlaps });
  });
  return out;
}

/** Pairs of segments inside ONE clip that cover the same moment (it would play twice). */
export function findSelfOverlaps(segments: readonly Segment[]): Array<[number, number]> {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (rangesOverlap(segments[i], segments[j])) pairs.push([i, j]);
    }
  }
  return pairs;
}

export type BandStatus = "none" | "empty" | "under" | "in" | "over" | "over-hard";

export type BandCheck = {
  status: BandStatus;
  /** Seconds short of the band (under), over the band (over) or over the hard cap. 0 when in. */
  deltaSec: number;
};

/**
 * Where does a stitched total sit against the campaign band?
 *  under      total < targetMin
 *  in         targetMin <= total <= targetMax (both edges are in)
 *  over       targetMax < total <= hardMax
 *  over-hard  total > hardMax
 * `none` = no campaign band; `empty` = nothing stitched yet.
 */
export function bandStatus(totalSec: number, band: Band | null | undefined): BandCheck {
  if (!band) return { status: "none", deltaSec: 0 };
  if (!(totalSec > 0)) return { status: "empty", deltaSec: 0 };
  if (totalSec < band.targetMinSec) {
    return { status: "under", deltaSec: band.targetMinSec - totalSec };
  }
  if (totalSec > band.hardMaxSec) {
    return { status: "over-hard", deltaSec: totalSec - band.hardMaxSec };
  }
  if (totalSec > band.targetMaxSec) {
    return { status: "over", deltaSec: totalSec - band.targetMaxSec };
  }
  return { status: "in", deltaSec: 0 };
}

/** `HH:MM:SS`. Whole seconds (floored); NaN, infinity and negatives read 00:00:00. */
export function formatTimecode(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const hh = String(Math.floor(s / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/**
 * Parse `SS`, `M:SS`, `MM:SS`, `H:MM:SS` or `HH:MM:SS`, each with an optional `.mmm`
 * fraction on the seconds. Returns seconds, or null when it is not a time. Minutes and
 * seconds must be below 60 once there is a larger unit in front of them.
 */
export function parseTimecode(text: string | null | undefined): number | null {
  if (text == null) return null;
  const t = String(text).trim();
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(t)) return null;
  const parts = t.split(":");
  const last = parts.length - 1;
  const secs = Number(parts[last]);
  if (parts.length > 1 && secs >= 60) return null;
  if (parts.length === 3 && Number(parts[1]) >= 60) return null;
  let total = secs;
  if (parts.length >= 2) total += Number(parts[last - 1]) * 60;
  if (parts.length === 3) total += Number(parts[0]) * 3600;
  return total;
}

/** `00:01:12 to 00:01:30` */
export function formatRange(range: Range): string {
  return `${formatTimecode(range.start)} to ${formatTimecode(range.end)}`;
}

/** Short human length for the readout under the numeral, e.g. `1:05` or `1:02:03`. */
export function formatLength(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}

/**
 * The caption line playing at time `t` (start <= t < end). When `t` falls in a gap, the
 * nearest earlier line is used so a segment that starts between captions still shows the
 * words just before it. Returns null when there is no line at or before `t`.
 * Lines need not be sorted.
 */
export function lineAtTime<L extends { start: number; end: number }>(
  lines: readonly L[] | null | undefined,
  t: number,
): L | null {
  if (!lines || !lines.length || !Number.isFinite(t)) return null;
  let before: L | null = null;
  for (const line of lines) {
    if (line.start <= t && t < line.end) return line;
    if (line.start <= t && (before === null || line.start > before.start)) before = line;
  }
  return before;
}
