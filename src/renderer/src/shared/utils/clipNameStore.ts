/**
 * File: clipNameStore.ts
 * Path: src/renderer/src/shared/utils/clipNameStore.ts
 * Description: The name of the clip being made right now, for the Making row when the clip did not
 *   come from a waiting moment (the Clip button path). The cut sets it as it starts and clears it
 *   when it ends; the Export panel reads it.
 */
import { useSyncExternalStore } from "react";

function createValue(initial: string | null) {
  let value = initial;
  const listeners = new Set<() => void>();
  return {
    get: () => value,
    set: (next: string | null) => {
      if (next === value) return;
      value = next;
      listeners.forEach((l) => l());
    },
    subscribe: (l: () => void) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
  };
}

const making = createValue(null);

export const setMakingName = making.set;
export const getMakingName = making.get;
export const useMakingName = () => useSyncExternalStore(making.subscribe, making.get, making.get);
