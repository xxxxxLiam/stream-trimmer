/**
 * File: editHistory.ts
 * Path: src/renderer/src/features/player/utils/editHistory.ts
 * Description: Undo and Redo for the timeline edits, as snapshots. `change` is told about every new state; changes
 *   that follow each other (a drag, a burst of edits) fold into one step once `settle` is called. A new edit
 *   after an undo drops what could have been redone. Pure: the hook decides when to settle and what a snapshot holds.
 */
export type EditHistory<T> = {
  /** Start over from this state (a new video or campaign, or a cut began). */
  reset: (state: T) => void;
  /** The state is now this. Equal to the current one: nothing happens. */
  change: (next: T) => void;
  /** Close the step in progress, so the next change starts a new one. */
  settle: () => void;
  /** The state to go back to, or null when there is nothing to undo. */
  undo: () => T | null;
  redo: () => T | null;
  subscribe: (l: () => void) => () => void;
  /** Stable between changes, for useSyncExternalStore. */
  get: () => { canUndo: boolean; canRedo: boolean };
};

export const HISTORY_LIMIT = 100;

export function createEditHistory<T>(equal: (a: T, b: T) => boolean, limit = HISTORY_LIMIT): EditHistory<T> {
  let past: T[] = [];
  let future: T[] = [];
  let base: T | null = null; // the state before the step in progress
  let cur: T | null = null;
  let view = { canUndo: false, canRedo: false };
  const listeners = new Set<() => void>();
  const publish = () => {
    const next = { canUndo: base !== null || past.length > 0, canRedo: future.length > 0 };
    if (next.canUndo === view.canUndo && next.canRedo === view.canRedo) return;
    view = next;
    listeners.forEach((l) => l());
  };
  const settle = () => {
    if (base !== null && cur !== null && !equal(base, cur)) {
      past.push(base);
      if (past.length > limit) past = past.slice(past.length - limit);
    }
    base = null;
  };
  return {
    reset(state) {
      past = [];
      future = [];
      base = null;
      cur = state;
      publish();
    },
    change(next) {
      if (cur === null) {
        cur = next;
        return;
      }
      if (equal(cur, next)) return;
      if (base === null) base = cur;
      cur = next;
      future = [];
      publish();
    },
    settle() {
      settle();
      publish();
    },
    undo() {
      settle();
      const prev = past.pop();
      if (prev === undefined || cur === null) {
        publish();
        return null;
      }
      future.push(cur);
      cur = prev;
      publish();
      return prev;
    },
    redo() {
      settle();
      const nxt = future.pop();
      if (nxt === undefined || cur === null) {
        publish();
        return null;
      }
      past.push(cur);
      cur = nxt;
      publish();
      return nxt;
    },
    subscribe(l) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    get: () => view,
  };
}
