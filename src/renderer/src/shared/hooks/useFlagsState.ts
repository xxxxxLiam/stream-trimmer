/**
 * File: useFlagsState.ts
 * Path: src/renderer/src/shared/hooks/useFlagsState.ts
 * Description: The open video's flags, shared by the timeline, the preview scrubber and the Markers
 *   tab. A module store keyed by video, kept in the settings file.
 */
import { useCallback, useSyncExternalStore } from "react";
import { readSetting, writeSetting } from "../utils/persist";
import { FLAG_KEY, normalizeFlags, withFlag, withoutFlag, type FlagsByVideo } from "../utils/flags";

let all: FlagsByVideo = normalizeFlags(readSetting<unknown>(FLAG_KEY, {}));
const listeners = new Set<() => void>();
const NONE: readonly number[] = [];

function commit(next: FlagsByVideo) {
  all = next;
  writeSetting(FLAG_KEY, next);
  listeners.forEach((l) => l());
}

export function addFlagTo(videoId: string, t: number) {
  commit({ ...all, [videoId]: withFlag(all[videoId] ?? NONE, t) });
}
export function removeFlagFrom(videoId: string, t: number) {
  const left = withoutFlag(all[videoId] ?? NONE, t);
  const next = { ...all };
  if (left.length) next[videoId] = left;
  else delete next[videoId];
  commit(next);
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** Flags of one video (stable array identity until it changes). */
export function useFlagsState(videoId: string | null) {
  const flags = useSyncExternalStore(
    subscribe,
    () => (videoId ? (all[videoId] ?? NONE) : NONE),
    () => NONE,
  );
  const addFlag = useCallback((t: number) => videoId && addFlagTo(videoId, t), [videoId]);
  const removeFlag = useCallback((t: number) => videoId && removeFlagFrom(videoId, t), [videoId]);
  return { flags, addFlag, removeFlag };
}
