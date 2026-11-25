/**
 * File: openRowStore.ts
 * Path: src/renderer/src/shared/utils/openRowStore.ts
 * Description: Which list row (Videos, Export, History) has its ⋯ open. One at a time: opening another closes
 *   this one. Keyed by an id the row picks, so a row only re-renders when its own state changes.
 */
import { useSyncExternalStore } from "react";

let openId: string | null = null;
const listeners = new Set<() => void>();

export const setOpenRow = (id: string | null): void => {
  if (openId === id) return;
  openId = id;
  listeners.forEach((l) => l());
};
export const getOpenRow = (): string | null => openId;

export const useRowOpen = (id: string): boolean =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => openId === id,
    () => openId === id,
  );
