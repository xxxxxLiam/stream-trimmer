/**
 * File: editKeys.ts
 * Path: src/renderer/src/features/player/utils/editKeys.ts
 * Description: Which chord means Undo or Redo: Cmd/Ctrl+Z, Shift+Cmd/Ctrl+Z, and Ctrl+Y on Windows and Linux.
 */
export type EditKey = { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean };

export function editAction(e: EditKey, mac: boolean): "undo" | "redo" | null {
  if (e.altKey) return null;
  const k = e.key.toLowerCase();
  const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
  if (!mod) return null;
  if (k === "z") return e.shiftKey ? "redo" : "undo";
  if (k === "y" && !mac && !e.shiftKey) return "redo";
  return null;
}

/** Whether typing in this element has its own undo, which keeps the key. */
export function ownsUndo(el: { tagName?: string; isContentEditable?: boolean } | null): boolean {
  return !!el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName ?? "") || !!el.isContentEditable);
}
