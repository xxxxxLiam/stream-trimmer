/**
 * File: useClipDestination.ts
 * Path: src/renderer/src/features/player/hooks/useClipDestination.ts
 * Description: Where clips go, as one sticky choice shared by every Clip button (the timeline
 *   header and the full-screen bar). Kept in the settings file; no editor is chosen for the user.
 */
import { useCallback, useSyncExternalStore } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import { normalizeDestination, type ClipDestination } from "../utils/clipDestination";

export const DESTINATION_KEY = "clipper.clipDestination";

let current: ClipDestination = normalizeDestination(readSetting<string>(DESTINATION_KEY, "folder"));
const listeners = new Set<() => void>();

export function getClipDestination(): ClipDestination {
  return current;
}

export function setClipDestination(next: ClipDestination): void {
  if (next === current) return;
  current = next;
  writeSetting(DESTINATION_KEY, next);
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useClipDestination(): [ClipDestination, (d: ClipDestination) => void] {
  const value = useSyncExternalStore(subscribe, getClipDestination, getClipDestination);
  return [value, useCallback((d: ClipDestination) => setClipDestination(d), [])];
}
