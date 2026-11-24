/**
 * File: markerMemory.ts
 * Path: src/renderer/src/features/markers/utils/markerMemory.ts
 * Description: Remembers, per video, which flag was trimmed to which range and which flags were
 *   clipped, so the Markers list survives a relaunch. Small external store over the settings file.
 */
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import { keyOf, type FlagMemory, type FlagRange } from "./markers";

const KEY = "clipper.markerMemory";

type All = Record<string, FlagMemory>;

const EMPTY: FlagMemory = { ranges: {}, clipped: [] };

export function setRange(mem: FlagMemory, at: number, range: FlagRange): FlagMemory {
  return { ...mem, ranges: { ...mem.ranges, [keyOf(at)]: range } };
}

export function markClipped(mem: FlagMemory, at: number): FlagMemory {
  const k = keyOf(at);
  if (mem.clipped.some((c) => keyOf(c) === k)) return mem;
  return { ...mem, clipped: [...mem.clipped, at] };
}

let all: All = readSetting<All>(KEY, {});
const listeners = new Set<() => void>();

function commit(next: All) {
  all = next;
  writeSetting(KEY, all);
  for (const l of listeners) l();
}

export const markerMemory = {
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  get: () => all,
  for: (videoId: string | null): FlagMemory => (videoId && all[videoId]) || EMPTY,
  trim(videoId: string, at: number, range: FlagRange) {
    commit({ ...all, [videoId]: setRange(all[videoId] ?? EMPTY, at, range) });
  },
  clip(videoId: string, at: number) {
    commit({ ...all, [videoId]: markClipped(all[videoId] ?? EMPTY, at) });
  },
};
