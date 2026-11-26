/**
 * File: selectMomentsStore.ts
 * Path: src/renderer/src/shared/utils/selectMomentsStore.ts
 * Description: "Select moments" mode of the Export panel (board 03.2.51): the panel's ··· menu turns it on,
 *   the bank cards show checkboxes, and the bar deletes the ticked ones after one confirm. A module store
 *   because the menu (the panel group) and the cards (the Export panel) are in different components.
 */
import { useSyncExternalStore } from "react";

export type SelectMoments = { on: boolean; ids: ReadonlySet<string> };
const OFF: SelectMoments = { on: false, ids: new Set() };
let state: SelectMoments = OFF;
const listeners = new Set<() => void>();
const set = (next: SelectMoments) => {
  state = next;
  listeners.forEach((l) => l());
};

export const getSelectMoments = () => state;
export const enterSelectMoments = () => set({ on: true, ids: new Set() });
export const exitSelectMoments = () => state.on && set(OFF);
export const toggleMoment = (id: string) => {
  const ids = new Set(state.ids);
  if (!ids.delete(id)) ids.add(id);
  set({ on: true, ids });
};
export const selectAllMoments = (all: readonly string[]) => set({ on: true, ids: new Set(all) });

export function useSelectMoments(): SelectMoments {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
    () => state,
  );
}
