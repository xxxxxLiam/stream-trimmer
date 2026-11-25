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
 * How the first-clip hint says to pick a part, for the tool in hand: scissors drag or click twice, the pointer
 * only moves the playhead, and the flag, hand and zoom tools do not pick a range at all so they point at the scissors.
 */
export function pickHintLead(tool: string): string {
  switch (tool) {
    case "clip":
      return "Drag on the timeline, or click to set the start and click again for the end";
    case "flag":
      return "Flags mark a spot; use the scissors to click a start and an end";
    case "hand":
      return "The hand moves the view; use the scissors to click a start and an end";
    case "zoom":
      return "Zoom resizes the view; use the scissors to click a start and an end";
    default:
      return "Choose the scissors, then drag on the timeline";
  }
}

/**
 * What a wheel or trackpad gesture over the timeline does, as in an editor: a sideways swipe (or
 * Shift + wheel) pans along the video, Ctrl/Cmd + wheel zooms around the pointer, a plain vertical
 * wheel does nothing here and is left to the page.
 */
export type WheelAction = { kind: "pan"; pixels: number } | { kind: "zoom"; direction: 1 | -1 } | null;

export function wheelAction(e: { deltaX: number; deltaY: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): WheelAction {
  if (e.ctrlKey || e.metaKey) return e.deltaY === 0 ? null : { kind: "zoom", direction: e.deltaY < 0 ? 1 : -1 };
  const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  const pixels = sideways ? e.deltaX : e.shiftKey ? e.deltaY : 0;
  return pixels === 0 ? null : { kind: "pan", pixels };
}

/** The pointer's x inside the lane, kept on the lane so a scrub that leaves it still reads the end. */
export const clampX = (x: number, width: number) => Math.min(Math.max(0, x), Math.max(0, width));
