/**
 * File: useNextClipName.ts
 * Path: src/renderer/src/modules/layout/hooks/useNextClipName.ts
 * Description: The name the next clip will get ("Honest Version"), published by the timeline (the name
 *   typed on the Clips lane, else the suggestion) and read by the bottom bar's audio-language menu and
 *   by the cut itself (getNextClipName) so the clip, its file and its project share one name. Null
 *   while there is no name to show.
 */
import { useSyncExternalStore } from "react";

let current: string | null = null;
const listeners = new Set<() => void>();

export function setNextClipName(name: string | null) {
  if (name === current) return;
  current = name;
  listeners.forEach((l) => l());
}

/** What the name is right now, for code that is not a component (the cut reads it when Clip is pressed). */
export function getNextClipName(): string | null {
  return current;
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useNextClipName(): string | null {
  return useSyncExternalStore(subscribe, () => current, () => null);
}
