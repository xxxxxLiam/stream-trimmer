/**
 * File: useAudioLanes.ts
 * Path: src/renderer/src/features/player/hooks/useAudioLanes.ts
 * Description: Whether the Audio lanes show under Source. Shown or hidden from the Panels menu, beside
 *   the Transcript lane; the choice sticks.
 */
import { useSyncExternalStore } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";

export const AUDIO_LANES_KEY = "clipper.audioLanes";
let shown = readSetting<boolean>(AUDIO_LANES_KEY, true) !== false;
const listeners = new Set<() => void>();

export function setAudioLanesShown(next: boolean) {
  if (next === shown) return;
  shown = next;
  writeSetting(AUDIO_LANES_KEY, next);
  listeners.forEach((l) => l());
}
export const getAudioLanesShown = () => shown;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useAudioLanes() {
  return useSyncExternalStore(subscribe, () => shown, () => true);
}
