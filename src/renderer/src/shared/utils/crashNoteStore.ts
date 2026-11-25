/**
 * File: crashNoteStore.ts
 * Path: src/renderer/src/shared/utils/crashNoteStore.ts
 * Description: Whether the window came back after its page process died, so Export can say so at the top
 *   (board 03.6.3 Clipr crashed). The main process reloads the window at ?crashed=1; the app reads that once,
 *   drops the flag from the address (a refresh is not a crash) and keeps the note until the window closes.
 */
import { useSyncExternalStore } from "react";

let open = false;
let consumed = false;
const listeners = new Set<() => void>();

/** Read the crashed flag once: show the note and clear the flag. Returns whether this launch was a crash reopen. */
export function consumeCrashFlag(search: string, replace: (clean: string) => void): boolean {
  if (consumed) return open;
  consumed = true;
  const params = new URLSearchParams(search);
  if (params.get("crashed") !== "1") return false;
  params.delete("crashed");
  const rest = params.toString();
  replace(rest ? `?${rest}` : "");
  open = true;
  listeners.forEach((l) => l());
  return true;
}

/** What pressing Send report or Copy details did, kept here so every tab's Export shows the same note. */
let report: { state: "idle" | "sent" | "kept"; copied: boolean } = { state: "idle", copied: false };
export function setCrashNoteReport(next: Partial<typeof report>): void {
  report = { ...report, ...next };
  listeners.forEach((l) => l());
}
export const useCrashNoteReport = () =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => report,
    () => report,
  );

export const closeCrashNote = (): void => {
  open = false;
  listeners.forEach((l) => l());
};

export const useCrashNoteOpen = (): boolean =>
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    () => open,
    () => false,
  );

/**
 * "Your work is back" is said only when it is true: the saved settings loaded with something in them to be back.
 * Anything less says only that Clipr closed.
 */
export function workIsBack(snapshot: Record<string, unknown> | undefined | null): boolean {
  return Object.keys(snapshot ?? {}).some((k) => /^clipper\.(campaigns|bank|workspaces|downloads)$/.test(k));
}

export function crashNoteText(back: boolean): string {
  return back ? "Clipr closed unexpectedly. Your work is back." : "Clipr closed unexpectedly.";
}
