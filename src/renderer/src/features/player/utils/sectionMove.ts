/**
 * File: sectionMove.ts
 * Path: src/renderer/src/features/player/utils/sectionMove.ts
 * Description: Moving a selected range along the video with the Pointer: its length stays the same, its
 *   times change, it stays inside the video; and when it meets another section the two read as one until
 *   the mouse is released.
 */
import type { Range } from "../../../shared/utils/segments";

/** Where a range of `len` seconds sits when the pointer is at `t` and grabbed it `grab` seconds from its start. */
export function movedRange(len: number, grab: number, t: number, duration: number): Range {
  const room = Math.max(0, duration - len);
  const start = Math.min(room, Math.max(0, Math.round(t - grab)));
  return { start, end: start + len };
}

/** Within this many pixels of another section (or over it) a dragged range counts as touching it. */
export const TOUCH_PX = 8;

export type Touch = { union: Range; indices: number[] };

/**
 * The sections a dragged range touches or overlaps (within `tol` seconds), and the one range they make
 * together; null when it touches none. Several touched sections all join.
 */
export function touching(range: Range, sections: readonly Range[], tol: number): Touch | null {
  const indices: number[] = [];
  let start = range.start;
  let end = range.end;
  sections.forEach((s, i) => {
    if (s.start <= range.end + tol && s.end >= range.start - tol) {
      indices.push(i);
      start = Math.min(start, s.start);
      end = Math.max(end, s.end);
    }
  });
  return indices.length ? { union: { start, end }, indices } : null;
}

export type Candidate = { id: "range" | number; r: Range };

/**
 * Which section a press at lane position `x` is on: the selected range first, then the locked sections in
 * order. A press near an edge grabs that edge; inside the body it grabs the body. Null when it is on none.
 */
export function pickSection(
  x: number,
  candidates: readonly Candidate[],
  xOf: (t: number) => number,
  edgeOf: (x: number, a: number, b: number) => "start" | "end" | null,
): { id: "range" | number; r: Range; edge: "start" | "end" | null } | null {
  for (const c of candidates) {
    const a = xOf(c.r.start);
    const b = xOf(c.r.end);
    const edge = edgeOf(x, a, b);
    if (edge || (x >= a && x <= b)) return { id: c.id, r: c.r, edge };
  }
  return null;
}
