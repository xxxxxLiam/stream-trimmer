/**
 * File: momentNoteStore.ts
 * Path: src/renderer/src/shared/utils/momentNoteStore.ts
 * Description: One quiet line at the top of Export that says what Add a moment / Ctrl B just did ("Saved for later"
 *   or "Already saved"), so the key never works in silence. It goes by itself after a few seconds.
 */
import { useSyncExternalStore } from "react";

const SHOWN_MS = 3500;
let note = "";
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

export function showMomentNote(text: string): void {
  note = text;
  listeners.forEach((l) => l());
  clearTimeout(timer);
  timer = setTimeout(() => {
    note = "";
    listeners.forEach((l) => l());
  }, SHOWN_MS);
}

export const useMomentNote = (): string =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => note,
    () => note,
  );

type Range = { start: number; end: number };

/** The banked clip whose parts are the same as these (to a quarter second), if there is one. */
export function bankedTwin<T extends { segments: Range[] }>(clips: T[], parts: Range[]): T | undefined {
  const same = (a: Range[], b: Range[]) => a.length === b.length && a.every((r, i) => Math.abs(r.start - b[i].start) < 0.25 && Math.abs(r.end - b[i].end) < 0.25);
  return clips.find((c) => same(c.segments, parts));
}
