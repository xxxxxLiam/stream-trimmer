/**
 * File: timelineAxis.ts
 * Path: src/renderer/src/features/player/utils/timelineAxis.ts
 * Description: Time to pixel mapping for the timeline. A linear axis for a zoom window, Fit, ruler
 *   ticks, and the folded axis: joined sections far apart are shown at one normal scale with the
 *   skipped part folded into a short marked strip (the ruler jumps across it).
 */
import type { Range } from "../../../shared/utils/segments";
import { clockTime } from "./transport";

export type Win = { start: number; end: number };

/** One stretch of the axis: time t0..t1 drawn at x0..x1. A folded piece has no time scale. */
export type AxisPiece = { t0: number; t1: number; x0: number; x1: number; folded: boolean };
export type Axis = { pieces: AxisPiece[]; width: number };

export const MIN_WINDOW_SECONDS = 30;
/** Each section sits in a stretch this long (the board: "52 s each side of the fold"), centred. */
export const FOLD_MARGIN_SECONDS = 52;
/** A section longer than the stretch still gets at least this much either side. */
export const FOLD_MIN_MARGIN_SECONDS = 8;
export const FOLD_WIDTH = 100;
export const FOLD_MIN_GAP_SECONDS = 120;

export function linearAxis(win: Win, width: number): Axis {
  return { pieces: [{ t0: win.start, t1: win.end, x0: 0, x1: width, folded: false }], width };
}

/** Zoom 0 shows the whole video; 100 shows about the closest useful stretch, around `focus`. */
export function windowFor(duration: number, zoom: number, focus: number): Win {
  if (!(duration > 0)) return { start: 0, end: 0 };
  const z = Math.min(100, Math.max(0, zoom)) / 100;
  const span = Math.min(duration, Math.max(MIN_WINDOW_SECONDS, duration * (1 - z) ** 3));
  let start = focus - span / 2;
  start = Math.min(Math.max(0, start), duration - span);
  return { start, end: start + span };
}

/** Fit: the range with room either side; with no range, the whole video. */
export function fitWindow(range: Range | null, duration: number): Win {
  if (!range || !(range.end > range.start)) return { start: 0, end: Math.max(0, duration) };
  const len = range.end - range.start;
  const pad = Math.max(len / 3, (MIN_WINDOW_SECONDS - len) / 2, 5);
  const start = Math.max(0, range.start - pad);
  const end = Math.min(duration || range.end + pad, range.end + pad);
  return { start, end };
}

const STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200];

/** Round-number ticks no closer than `minGapPx`, for a linear axis. */
export function rulerTicks(win: Win, widthPx: number, minGapPx = 110): { t: number; label: string }[] {
  const span = win.end - win.start;
  if (!(span > 0) || !(widthPx > 0)) return [];
  const minSeconds = (minGapPx / widthPx) * span;
  const step = STEPS.find((s) => s >= minSeconds) ?? STEPS[STEPS.length - 1];
  const out: { t: number; label: string }[] = [];
  for (let t = Math.ceil(win.start / step) * step; t <= win.end; t += step) out.push({ t, label: clockTime(t) });
  return out;
}

export function toX(axis: Axis, t: number): number {
  for (const p of axis.pieces) {
    if (p.folded) continue;
    if (t <= p.t1) return p.x0 + Math.max(0, (t - p.t0) / (p.t1 - p.t0)) * (p.x1 - p.x0);
  }
  const last = axis.pieces[axis.pieces.length - 1];
  return last ? last.x1 : 0;
}

/** Time at pixel x, or null inside a fold. */
export function toT(axis: Axis, x: number): number | null {
  for (const p of axis.pieces) {
    if (x > p.x1) continue;
    if (p.folded) return null;
    return p.t0 + ((x - p.x0) / (p.x1 - p.x0)) * (p.t1 - p.t0);
  }
  const last = axis.pieces[axis.pieces.length - 1];
  return last && !last.folded ? last.t1 : null;
}

/** `skipped` is the stretch left out of view; `gap` is the footage between the two sections it sits between. */
export type Fold = { x: number; width: number; skipped: number; gap: number; from: number; to: number };
export type FoldedAxis = { axis: Axis; fold: Fold[] };

/**
 * The folded layout for sections far apart, or null when nothing needs folding. Each section sits
 * in a stretch of `stretch` seconds (centred, with at least `margin` either side); the gap between
 * two stretches folds when it is long enough.
 */
export function foldedAxis(
  sections: readonly Range[],
  duration: number,
  widthPx: number,
  opts: { margin?: number; stretch?: number; foldWidth?: number; minGap?: number } = {},
): FoldedAxis | null {
  const stretch = opts.stretch ?? FOLD_MARGIN_SECONDS;
  const minMargin = opts.margin ?? FOLD_MIN_MARGIN_SECONDS;
  const foldWidth = opts.foldWidth ?? FOLD_WIDTH;
  const minGap = opts.minGap ?? FOLD_MIN_GAP_SECONDS;
  if (sections.length < 2) return null;
  const sorted = [...sections].sort((a, b) => a.start - b.start);
  // Merge sections whose margins touch into one window; what is left between windows may fold.
  const windows: (Win & { sStart: number; sEnd: number })[] = [];
  for (const s of sorted) {
    const margin = Math.max(minMargin, (stretch - (s.end - s.start)) / 2);
    const w = { start: Math.max(0, s.start - margin), end: Math.min(duration || Infinity, s.end + margin), sStart: s.start, sEnd: s.end };
    const prev = windows[windows.length - 1];
    if (prev && w.start - prev.end < minGap) {
      prev.end = Math.max(prev.end, w.end);
      prev.sEnd = Math.max(prev.sEnd, s.end);
    } else windows.push(w);
  }
  if (windows.length < 2) return null;
  const shown = windows.reduce((n, w) => n + (w.end - w.start), 0);
  const scale = (widthPx - foldWidth * (windows.length - 1)) / shown;
  if (!(scale > 0)) return null;
  const pieces: AxisPiece[] = [];
  const fold: Fold[] = [];
  let x = 0;
  windows.forEach((w, i) => {
    const wide = (w.end - w.start) * scale;
    pieces.push({ t0: w.start, t1: w.end, x0: x, x1: x + wide, folded: false });
    x += wide;
    const next = windows[i + 1];
    if (next) {
      pieces.push({ t0: w.end, t1: next.start, x0: x, x1: x + foldWidth, folded: true });
      fold.push({ x, width: foldWidth, skipped: next.start - w.end, gap: next.sStart - w.sEnd, from: w.end, to: next.start });
      x += foldWidth;
    }
  });
  return { axis: { pieces, width: x }, fold };
}

/** The zoom (0 to 100) that shows `span` seconds of a `duration` video. Inverse of windowFor. */
export function zoomForSpan(duration: number, span: number): number {
  if (!(duration > 0) || !(span > 0) || span >= duration) return 0;
  return Math.min(100, Math.max(0, Math.round((1 - (span / duration) ** (1 / 3)) * 100)));
}

/** Ruler ticks for every shown stretch of an axis, as pixels. The fold has none (it is labelled). */
export function axisTicks(axis: Axis, minGapPx = 110): { t: number; x: number; label: string }[] {
  const out: { t: number; x: number; label: string }[] = [];
  for (const p of axis.pieces) {
    if (p.folded) continue;
    const w = p.x1 - p.x0;
    for (const tick of rulerTicks({ start: p.t0, end: p.t1 }, w, minGapPx)) {
      out.push({ ...tick, x: p.x0 + ((tick.t - p.t0) / (p.t1 - p.t0)) * w });
    }
  }
  return out;
}
