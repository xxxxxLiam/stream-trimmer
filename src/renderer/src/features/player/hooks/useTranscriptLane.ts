/**
 * File: useTranscriptLane.ts
 * Path: src/renderer/src/features/player/hooks/useTranscriptLane.ts
 * Description: Whether the optional Transcript lane shows above Source. Shown or hidden from the
 *   Panels menu; the choice sticks.
 */
import { useSyncExternalStore } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";

export const TRANSCRIPT_LANE_KEY = "clipper.transcriptLane";
let shown = readSetting<boolean>(TRANSCRIPT_LANE_KEY, true) !== false;
const listeners = new Set<() => void>();

export function setTranscriptLaneShown(next: boolean) {
  if (next === shown) return;
  shown = next;
  writeSetting(TRANSCRIPT_LANE_KEY, next);
  listeners.forEach((l) => l());
}
export const getTranscriptLaneShown = () => shown;

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

export function useTranscriptLane() {
  return useSyncExternalStore(subscribe, () => shown, () => true);
}
