/**
 * File: useNextClipName.ts
 * Path: src/renderer/src/modules/layout/hooks/useNextClipName.ts
 * Description: The name the next clip will get ("Honest Version"), published by the timeline and
 *   read by the bottom bar's audio-language menu to list the files the next Clip makes. Null while
 *   there is no name to show.
 */
import { useSyncExternalStore } from "react";

let current: string | null = null;
const listeners = new Set<() => void>();

export function setNextClipName(name: string | null) {
  if (name === current) return;
  current = name;
  listeners.forEach((l) => l());
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
