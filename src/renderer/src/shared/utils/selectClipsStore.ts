/**
 * File: selectClipsStore.ts
 * Path: src/renderer/src/shared/utils/selectClipsStore.ts
 * Description: "Select clips" mode of the History panel: the panel's ⋯ menu turns it on, location clips show checkboxes, and
 *   the bottom bar adds the ticked ones to Final Cut. A module store because the menu (the panel group) and the rows
 *   (the History panel) are in different components.
 */
import { useSyncExternalStore } from "react";

export type SelectClips = { on: boolean; ids: ReadonlySet<string> };
const OFF: SelectClips = { on: false, ids: new Set() };
let state: SelectClips = OFF;
const listeners = new Set<() => void>();
const set = (next: SelectClips) => {
  state = next;
  listeners.forEach((l) => l());
};

export const getSelectClips = () => state;
export const enterSelectClips = () => set({ on: true, ids: new Set() });
export const exitSelectClips = () => state.on && set(OFF);
export const toggleClip = (id: string) => {
  const ids = new Set(state.ids);
  if (!ids.delete(id)) ids.add(id);
  set({ on: true, ids });
};
export const selectAllClips = (all: readonly string[]) => set({ on: true, ids: new Set(all) });

export function useSelectClips(): SelectClips {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
