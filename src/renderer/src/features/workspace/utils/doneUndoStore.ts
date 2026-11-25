/**
 * File: doneUndoStore.ts
 * Path: src/renderer/src/features/workspace/utils/doneUndoStore.ts
 * Description: The "Moved … to Done · Undo" line. Kept outside the Videos panel because marking the
 *   open video Done switches to another video, which can remount the panel and would lose a line held
 *   in the panel's own state (B2-4).
 */
/** `done`: moved to Done. `removed`: taken out of the list (its tab is brought back by Undo). */
export type DoneUndo = { id: string; title: string; kind: "done" | "removed"; at: number };

export function createDoneUndoStore(ms: number, schedule: (fn: () => void, ms: number) => unknown = setTimeout, cancel: (h: unknown) => void = (h) => clearTimeout(h as ReturnType<typeof setTimeout>)) {
  let value: DoneUndo | null = null;
  let handle: unknown = null;
  const listeners = new Set<() => void>();
  const set = (next: DoneUndo | null) => {
    value = next;
    listeners.forEach((l) => l());
  };
  return {
    get: () => value,
    subscribe(l: () => void) {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    show(u: { id: string; title: string; kind?: DoneUndo["kind"] }) {
      if (handle !== null) cancel(handle);
      set({ ...u, kind: u.kind ?? "done", at: Date.now() });
      handle = schedule(() => {
        handle = null;
        set(null);
      }, ms);
    },
    clear() {
      if (handle !== null) cancel(handle);
      handle = null;
      if (value) set(null);
    },
  };
}

/** One line for the whole app: 8 seconds, as on board 03.2.6. */
export const doneUndoStore = createDoneUndoStore(8000);
