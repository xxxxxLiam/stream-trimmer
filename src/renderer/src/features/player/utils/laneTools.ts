/**
 * File: laneTools.ts
 * Path: src/renderer/src/features/player/utils/laneTools.ts
 * Description: The pure decisions behind the timeline tools: the scissors' two clicks (a start, then
 *   an end; they only mark, never seek), grabbing a range's edge, and zooming in or out.
 */
import { DEFAULT_SIZES } from "../../../modules/layout/utils/panelLayout";
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
 * How the first-clip hint says to pick a part, for the tool in hand: scissors click twice, Select range drags, the pointer
 * only moves the playhead, and the flag, hand and zoom tools do not pick a range at all so they point at the scissors.
 */
export function pickHintLead(tool: string): string {
  switch (tool) {
    case "clip":
      return "Click the pictures to set the start, click again for the end";
    case "range":
      return "Drag across the pictures";
    case "flag":
      return "Flags mark a spot; press D, then drag across the pictures";
    case "hand":
      return "The hand moves the view; press D, then drag across the pictures";
    case "zoom":
      return "Zoom resizes the view; press D, then drag across the pictures";
    default:
      return "Press D, then drag across the pictures";
  }
}

/**
 * What a wheel or trackpad gesture over the timeline does, as in an editor: a sideways swipe (or
 * Shift + wheel) pans along the video, Ctrl/Cmd + wheel zooms around the pointer, a plain vertical
 * wheel does nothing here and is left to the page.
 */
export type WheelAction = { kind: "pan"; pixels: number } | { kind: "zoom"; amount: number } | null;

export function wheelAction(e: { deltaX: number; deltaY: number; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): WheelAction {
  // A trackpad pinch arrives as a wheel with Ctrl held and small deltas; a mouse wheel has big ones.
  // The step follows the size of the gesture, so a pinch is smooth and a wheel notch is one step.
  if (e.ctrlKey || e.metaKey) return e.deltaY === 0 ? null : { kind: "zoom", amount: Math.max(-ZOOM_STEP, Math.min(ZOOM_STEP, -e.deltaY * 1.5)) };
  const sideways = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  const pixels = sideways ? e.deltaX : e.shiftKey ? e.deltaY : 0;
  return pixels === 0 ? null : { kind: "pan", pixels };
}

/** The pointer's x inside the lane, kept on the lane so a scrub that leaves it still reads the end. */
export const clampX = (x: number, width: number) => Math.min(Math.max(0, x), Math.max(0, width));

/** The zoom tool zooms out while Alt is held, and its cursor says so. */
export const cursorFor = (tool: keyof typeof TOOL_CURSORS, alt: boolean) =>
  tool === "zoom" && alt ? "cursor-zoom-out" : TOOL_CURSORS[tool];

/** The zoom (0 to 100) for a press or drag at `clientX` on a slider whose track starts at `left`. */
export const zoomFromX = (clientX: number, left: number, width: number) =>
  width > 0 ? Math.min(100, Math.max(0, ((clientX - left) / width) * 100)) : 0;

/** The mouse cursor for each tool, over the whole timeline: an arrow, crosshair (scissors), resize bar (range), cell, hand and magnifier. */
export const TOOL_CURSORS = {
  pointer: "cursor-default",
  clip: "cursor-crosshair",
  range: "cursor-col-resize",
  flag: "cursor-cell",
  hand: "cursor-grab",
  zoom: "cursor-zoom-in",
} as const;

/**
 * Where a clip's name goes. It sits inside its bar when it fits; when it does not it continues just past
 * the bar's end into the free space before the next bar, and is cut only when that runs out too.
 */
export type LabelBar = { left: number; width: number; label: string };
export type LabelPlace = { inside: boolean; outsideWidth: number };

const CHAR_PX = 7; // 12px Inter, a little generous
const PAD_PX = 16;
export const labelWidth = (label: string) => label.length * CHAR_PX + PAD_PX;

export function placeLabels(bars: readonly LabelBar[], laneWidth: number): LabelPlace[] {
  const order = bars.map((b, i) => i).sort((a, b) => bars[a].left - bars[b].left);
  const out: LabelPlace[] = bars.map(() => ({ inside: true, outsideWidth: 0 }));
  order.forEach((i, k) => {
    const b = bars[i];
    if (labelWidth(b.label) <= b.width) return;
    const right = b.left + b.width;
    // The next bar starting after this one, even when it overlaps this one: a name never runs over it.
    const next = order.slice(k + 1).map((j) => bars[j].left).find((l) => l > b.left + 0.5);
    const room = (next ?? laneWidth) - right - 4;
    out[i] = room >= 24 ? { inside: false, outsideWidth: Math.min(room, labelWidth(b.label)) } : { inside: true, outsideWidth: 0 };
  });
  return out;
}

/**
 * Dragging the playhead (or a range edge) near either end of a zoomed timeline scrolls it: -1..1 for how hard
 * to push left or right, 0 in the middle. Right at the edge, or past it, is full speed.
 */
export const EDGE_ZONE = 32;
export function edgeScroll(x: number, width: number, zone = EDGE_ZONE): number {
  if (!(width > 2 * zone)) return 0;
  if (x < zone) return -Math.min(1, (zone - x) / zone);
  if (x > width - zone) return Math.min(1, (x - (width - zone)) / zone);
  return 0;
}

/**
 * V18-T-6: bars that overlap on the lane (a long video at Fit makes every clip about 18px) are stacked
 * into rows instead of drawn on top of each other. Bars in a cluster of overlaps share the cluster's row
 * count; a bar that overlaps nothing stays alone in one row, drawn full height as before.
 */
export type RowSlot = { row: number; rows: number; from: number; to: number };
export function packRows(bars: readonly { left: number; width: number }[]): RowSlot[] {
  const out: RowSlot[] = bars.map((b) => ({ row: 0, rows: 1, from: b.left, to: b.left + b.width }));
  const order = bars.map((_, i) => i).sort((a, b) => bars[a].left - bars[b].left || a - b);
  let cluster: number[] = [];
  let clusterRight = -Infinity;
  const rowRights: number[] = [];
  const flush = () => {
    const from = Math.min(...cluster.map((i) => bars[i].left));
    for (const i of cluster) Object.assign(out[i], { rows: rowRights.length, from, to: clusterRight });
    cluster = [];
    rowRights.length = 0;
    clusterRight = -Infinity;
  };
  for (const i of order) {
    const b = bars[i];
    if (cluster.length && b.left >= clusterRight) flush();
    let row = rowRights.findIndex((r) => b.left >= r);
    if (row < 0) row = rowRights.push(0) - 1;
    rowRights[row] = b.left + b.width;
    out[i].row = row;
    cluster.push(i);
    clusterRight = Math.max(clusterRight, b.left + b.width);
  }
  flush();
  return out;
}

/**
 * The Source lane is 44px at the default timeline size; when the timeline is made taller the picture
 * strip takes all the extra height (the Transcript and Clips lanes keep theirs).
 */
export const SOURCE_LANE_MIN = 44;
export const sourceLaneHeight = (timelineHeight: number) =>
  SOURCE_LANE_MIN + Math.max(0, Math.round(timelineHeight) - DEFAULT_SIZES.timeline);
