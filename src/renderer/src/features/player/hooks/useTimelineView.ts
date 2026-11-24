/**
 * File: useTimelineView.ts
 * Path: src/renderer/src/features/player/hooks/useTimelineView.ts
 * Description: The part of the video the timeline is zoomed to, published by the timeline and read
 *   by the preview scrubber (brighter inside the zoomed part). null while the whole video shows.
 */
import { useSyncExternalStore } from "react";
import type { Win } from "../utils/timelineAxis";

let view: Win | null = null;
const listeners = new Set<() => void>();

export function publishTimelineView(next: Win | null) {
  const same = next === view || (next && view && next.start === view.start && next.end === view.end);
  if (same) return;
  view = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useTimelineView(): Win | null {
  return useSyncExternalStore(subscribe, () => view, () => null);
}
