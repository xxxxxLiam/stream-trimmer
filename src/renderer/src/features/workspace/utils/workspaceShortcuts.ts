/**
 * File: workspaceShortcuts.ts
 * Path: src/renderer/src/features/workspace/utils/workspaceShortcuts.ts
 * Description: Which workspace action a key chord means. There are no browser-style video tabs, so
 *   Ctrl/Cmd+T, +W and +Shift+T mean nothing here (B-13); removing a video is the Videos list's own control.
 */
import { indexForDigit } from "../../../shared/utils/tabOps";

export type KeyChord = { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean };

export type WorkspaceShortcut =
  | { kind: "select"; index: number }
  | { kind: "step"; back: boolean }
  | { kind: "move"; delta: 1 | -1 };

/** The action for a chord, or null when the chord is not ours. `count` is the number of videos. */
export function workspaceShortcut(e: KeyChord, count: number): WorkspaceShortcut | null {
  if (!(e.metaKey || e.ctrlKey) || e.altKey) return null;
  const k = e.key.toLowerCase();
  if (!e.shiftKey && /^[1-9]$/.test(k)) {
    const index = indexForDigit(Number(k), count);
    return index === null ? null : { kind: "select", index };
  }
  if (k === "tab" || (!e.shiftKey && (k === "pagedown" || k === "pageup"))) {
    return { kind: "step", back: k === "pageup" || (k === "tab" && e.shiftKey) };
  }
  if (e.shiftKey && (k === "pagedown" || k === "pageup")) return { kind: "move", delta: k === "pageup" ? -1 : 1 };
  return null;
}

