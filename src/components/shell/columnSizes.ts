/**
 * File: columnSizes.ts
 * Path: src/components/shell/columnSizes.ts
 * Description: Pure logic for the resizable workspace columns. The two SIDE columns
 *   (transcript, clips) have a width; the centre takes whatever is left. Nothing here
 *   touches the DOM or settings, so it is all testable on its own.
 */

/** Settings key. Value: { transcript?: number, clips?: number } in CSS px; absent = default. */
export const COLUMN_WIDTHS_KEY = "clipper.columnWidths";

export type ColumnKind = "transcript" | "clips";

/** null = never dragged: the stylesheet's own width for that column applies. */
export type StoredWidths = { transcript: number | null; clips: number | null };
export type Widths = { transcript: number; clips: number };

/** No side column goes below this. Wide enough for a timestamp plus a few words. */
export const MIN_SIDE_PX = 200;
/** Upper limits per column, before the centre-column floor below. */
export const MAX_SIDE_PX: Record<ColumnKind, number> = { transcript: 560, clips: 480 };
/** The centre column (video, marks) never gets narrower than this. */
export const MIN_CENTRE_PX = 320;
/** Row padding (2 x 8) plus the two 8px gaps between the three columns. */
export const ROW_CHROME_PX = 32;

/** Arrow-key step, and the larger step with Shift held. */
export const STEP_PX = 16;
export const STEP_LARGE_PX = 64;

/** Keep in step with the flex-basis values in styles.css (240/220, then 280/260 from 1040). */
export function defaultWidth(kind: ColumnKind, containerPx: number): number {
  const wide = containerPx >= 1040;
  return kind === "transcript" ? (wide ? 280 : 240) : wide ? 260 : 220;
}

export function defaultWidths(containerPx: number): Widths {
  return { transcript: defaultWidth("transcript", containerPx), clips: defaultWidth("clips", containerPx) };
}

/** The allowed range for one side column given the container and the other side's width. */
export function boundsFor(
  kind: ColumnKind,
  containerPx: number,
  otherPx: number,
): { min: number; max: number } {
  const room = containerPx - ROW_CHROME_PX - MIN_CENTRE_PX - otherPx;
  const max = Math.max(MIN_SIDE_PX, Math.min(MAX_SIDE_PX[kind], Math.floor(room)));
  return { min: MIN_SIDE_PX, max };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

/** Clamp a requested width for one column. Non-finite requests fall back to the minimum. */
export function clampWidth(kind: ColumnKind, requested: number, containerPx: number, otherPx: number): number {
  const { min, max } = boundsFor(kind, containerPx, otherPx);
  return Math.round(clamp(Number.isFinite(requested) ? requested : min, min, max));
}

/**
 * What the columns actually are at this container width: stored values (or defaults),
 * clamped so the centre keeps its floor. A narrower window squeezes the result without
 * rewriting what was stored, so widening it again restores the chosen widths.
 */
export function resolveWidths(stored: StoredWidths, containerPx: number): Widths {
  const d = defaultWidths(containerPx);
  const clips0 = clampWidth("clips", stored.clips ?? d.clips, containerPx, MIN_SIDE_PX);
  const transcript = clampWidth("transcript", stored.transcript ?? d.transcript, containerPx, clips0);
  const clips = clampWidth("clips", stored.clips ?? d.clips, containerPx, transcript);
  return { transcript, clips };
}

export type KeyMove = "grow" | "shrink" | "min" | "max";

/**
 * Map a key to a move for the handle that controls `kind`. The arrows follow the divider:
 * the transcript handle moving right widens the transcript, the clips handle moving right
 * narrows clips. Returns null for keys the handle does not use.
 */
export function moveForKey(kind: ColumnKind, key: string): KeyMove | null {
  if (key === "Home") return "min";
  if (key === "End") return "max";
  if (key !== "ArrowLeft" && key !== "ArrowRight") return null;
  const right = key === "ArrowRight";
  return kind === "transcript" ? (right ? "grow" : "shrink") : right ? "shrink" : "grow";
}

/** Apply a keyboard move to the current width of `kind`. */
export function applyMove(
  kind: ColumnKind,
  move: KeyMove,
  current: Widths,
  containerPx: number,
  large = false,
): number {
  const other = kind === "transcript" ? current.clips : current.transcript;
  const { min, max } = boundsFor(kind, containerPx, other);
  const step = large ? STEP_LARGE_PX : STEP_PX;
  const from = current[kind];
  const next = move === "min" ? min : move === "max" ? max : move === "grow" ? from + step : from - step;
  return clampWidth(kind, next, containerPx, other);
}

/** Width during a pointer drag. `dx` is the pointer travel since the drag began. */
export function dragWidth(
  kind: ColumnKind,
  startWidth: number,
  dx: number,
  current: Widths,
  containerPx: number,
): number {
  const other = kind === "transcript" ? current.clips : current.transcript;
  return clampWidth(kind, kind === "transcript" ? startWidth + dx : startWidth - dx, containerPx, other);
}

/** Sanitise whatever the settings file holds. Anything unusable becomes "not set". */
export function parseStored(raw: unknown): StoredWidths {
  const pick = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.round(v) : null;
  if (!raw || typeof raw !== "object") return { transcript: null, clips: null };
  const r = raw as Record<string, unknown>;
  return { transcript: pick(r.transcript), clips: pick(r.clips) };
}

/** What to write back: null (removes the key) when nothing is customised. */
export function serializeStored(s: StoredWidths): Record<string, number> | null {
  const out: Record<string, number> = {};
  if (s.transcript !== null) out.transcript = s.transcript;
  if (s.clips !== null) out.clips = s.clips;
  return Object.keys(out).length ? out : null;
}
