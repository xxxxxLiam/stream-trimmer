/**
 * File: inFinalCutStore.ts
 * Path: src/renderer/src/shared/utils/inFinalCutStore.ts
 * Description: Which History clips have been added to Final Cut this session. A clip just added says "In Final Cut" on its
 *   row for 2 seconds, then the row goes quiet and its ⋯ item shows greyed (Design, Add to Final Cut). A module store
 *   because the add runs from the row menu and from the select bar.
 */
import { useSyncExternalStore } from "react";

export const IN_FINAL_CUT_MS = 2000;

type State = { added: ReadonlyMap<string, number> };
let state: State = { added: new Map() };
let version = 0;
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setTimeout> | null = null;

const publish = (added: Map<string, number>) => {
  state = { added };
  version++;
  listeners.forEach((l) => l());
};

/** Entries now in Final Cut (added just now, or already there). */
export function markInFinalCut(ids: readonly string[], now: number = Date.now()) {
  if (ids.length === 0) return;
  const next = new Map(state.added);
  ids.forEach((id) => next.set(id, now));
  publish(next);
  // The "In Final Cut" line ends by itself: one more render when the 2 seconds are up.
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    version++;
    listeners.forEach((l) => l());
  }, IN_FINAL_CUT_MS + 20);
}

export function resetInFinalCut() {
  if (timer) clearTimeout(timer);
  publish(new Map());
}

/** Pure, for the row: is this entry showing "In Final Cut" right now, and has it been added at all. */
export function finalCutState(added: ReadonlyMap<string, number>, id: string, now: number = Date.now()): { added: boolean; showing: boolean } {
  const at = added.get(id);
  return { added: at !== undefined, showing: at !== undefined && now - at < IN_FINAL_CUT_MS };
}

export function useInFinalCut() {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => version,
    () => 0,
  );
  return state.added;
}
