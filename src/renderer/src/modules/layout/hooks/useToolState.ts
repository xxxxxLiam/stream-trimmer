/**
 * File: useToolState.ts
 * Path: src/renderer/src/modules/layout/hooks/useToolState.ts
 * Description: The timeline tools shared between the bottom bar (which shows and changes them) and
 *   the timeline (which reacts to them): the active tool, the zoom, and a "fit" request. A module
 *   store so the two sit in different panels without passing props. Zoom is 0 (whole video) to 100.
 */
import { useCallback, useSyncExternalStore } from "react";

export type TimelineTool = "pointer" | "clip" | "range" | "flag" | "hand" | "zoom";
export const TIMELINE_TOOLS: readonly TimelineTool[] = ["pointer", "clip", "range", "flag", "hand", "zoom"];

export type ToolState = {
  tool: TimelineTool;
  /** 0 is Fit (the whole video), 100 the closest zoom, below 0 zoomed out past Fit. */
  zoom: number;
  /** Counts up on every Fit press; the timeline fits the view to the range when it changes. */
  fitRequests: number;
};

/**
 * The key that picks each tool, after Final Cut (A pointer, B blade, H hand, Z zoom). M is not here:
 * it drops a flag at the playhead while watching, so the Flag tool is F and Select range is D (R is
 * Retry; S and B are the Keyboard board's skip and bank keys in the review flow, so S stays free). A tool key never fires with Cmd, Ctrl or Alt held.
 */
export const TOOL_KEYS: Record<TimelineTool, string> = { pointer: "a", clip: "b", range: "d", flag: "f", hand: "h", zoom: "z" };

export function toolForKey(e: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey?: boolean }): TimelineTool | null {
  if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return null;
  const k = e.key.toLowerCase();
  return TIMELINE_TOOLS.find((t) => TOOL_KEYS[t] === k) ?? null;
}

const INITIAL: ToolState = { tool: "pointer", zoom: 0, fitRequests: 0 };
let state: ToolState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<ToolState>) {
  const next = { ...state, ...patch };
  if (next.tool === state.tool && next.zoom === state.zoom && next.fitRequests === state.fitRequests) return;
  state = next;
  for (const l of listeners) l();
}

/** Zoom 0 is Fit, 100 the closest, and down to here the view goes out until the video fills a third of the lane. */
export const ZOOM_MIN = -25;
export const clampZoom = (z: number) => Math.min(100, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));

export function setTool(tool: TimelineTool) {
  set({ tool });
}
export function setZoom(zoom: number) {
  set({ zoom: clampZoom(zoom) });
}
export const getZoom = () => state.zoom;
export function requestFit() {
  set({ zoom: 0, fitRequests: state.fitRequests + 1 });
}
/** Tests only. */
export const getToolStateForTest = () => state;
/** Tests only. */
export function resetToolStateForTest() {
  state = INITIAL;
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Read and change the timeline tools from any panel. */
export function useToolState() {
  const snap = useSyncExternalStore(subscribe, () => state, () => state);
  return {
    ...snap,
    setTool: useCallback(setTool, []),
    setZoom: useCallback(setZoom, []),
    zoomBy: useCallback((delta: number) => setZoom(state.zoom + delta), []),
    fit: useCallback(requestFit, []),
  };
}
