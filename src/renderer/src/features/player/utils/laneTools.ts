/**
 * File: laneTools.ts
 * Path: src/renderer/src/features/player/utils/laneTools.ts
 * Description: The pure decisions behind the timeline tools: the scissors' two clicks (a start, then
 *   an end; they only mark, never seek), grabbing a range's edge, and zooming in or out.
 */
export const EDGE_GRAB_PX = 8;

export type ScissorsStep =
  | { kind: "start"; at: number }
  | { kind: "range"; start: number; end: number };

/** First click is the start; the second makes the range, in order, whichever side it landed on. */
export function scissorsClick(startAt: number | null, t: number): ScissorsStep {
  if (startAt === null) return { kind: "start", at: t };
  return { kind: "range", start: Math.min(startAt, t), end: Math.max(startAt, t) };
}

export function grabbedEdge(x: number, startX: number, endX: number): "start" | "end" | null {
  const ds = Math.abs(x - startX);
  const de = Math.abs(x - endX);
  if (ds > EDGE_GRAB_PX && de > EDGE_GRAB_PX) return null;
  return ds <= de ? "start" : "end";
}

export const ZOOM_STEP = 20;
export const zoomStep = (alt: boolean) => (alt ? -ZOOM_STEP : ZOOM_STEP);
