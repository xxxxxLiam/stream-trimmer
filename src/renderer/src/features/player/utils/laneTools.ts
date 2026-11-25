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

/**
 * How the first-clip hint says to pick a part, for the tool in hand: scissors click twice, the pointer
 * drags, and the flag, hand and zoom tools do not pick a range at all so they point at the scissors.
 */
export function pickHintLead(tool: string): string {
  switch (tool) {
    case "clip":
      return "Click to set the start, click again for the end";
    case "flag":
      return "Flags mark a spot; use the scissors to click a start and an end";
    case "hand":
      return "The hand moves the view; use the scissors to click a start and an end";
    case "zoom":
      return "Zoom resizes the view; use the scissors to click a start and an end";
    default:
      return "Drag on the timeline";
  }
}
