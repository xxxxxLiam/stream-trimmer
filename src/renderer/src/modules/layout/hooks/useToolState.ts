/**
 * File: useToolState.ts
 * Path: src/renderer/src/modules/layout/hooks/useToolState.ts
 * Description: The timeline tools shared between the bottom bar (which shows and changes them) and
 *   the timeline (which reacts to them): the active tool, the zoom, and a "fit" request. A module
 *   store so the two sit in different panels without passing props. Zoom is 0 (whole video) to 100.
 */
import { useCallback, useSyncExternalStore } from "react";

export type TimelineTool = "pointer" | "clip" | "flag" | "hand" | "zoom";
export const TIMELINE_TOOLS: readonly TimelineTool[] = ["pointer", "clip", "flag", "hand", "zoom"];

export type ToolState = {
  tool: TimelineTool;
  /** 0 shows the whole video, 100 is the closest zoom. */
  zoom: number;
  /** Counts up on every Fit press; the timeline fits the view to the range when it changes. */
  fitRequests: number;
};

const INITIAL: ToolState = { tool: "pointer", zoom: 0, fitRequests: 0 };
let state: ToolState = INITIAL;
const listeners = new Set<() => void>();

function set(patch: Partial<ToolState>) {
  const next = { ...state, ...patch };
  if (next.tool === state.tool && next.zoom === state.zoom && next.fitRequests === state.fitRequests) return;
  state = next;
  for (const l of listeners) l();
}

export const clampZoom = (z: number) => Math.min(100, Math.max(0, Math.round(z)));

export function setTool(tool: TimelineTool) {
  set({ tool });
}
export function setZoom(zoom: number) {
  set({ zoom: clampZoom(zoom) });
}
export function requestFit() {
  set({ zoom: 0, fitRequests: state.fitRequests + 1 });
}
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
