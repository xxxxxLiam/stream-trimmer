/**
 * File: editorLayouts.ts
 * Path: src/renderer/src/shared/utils/editorLayouts.ts
 * Description: Which layouts each editor can honour, so the campaign form shows a Layout row only
 *   where it works and lists only the templates that editor supports. Final Cut gets all four.
 *   Resolve and Premiere have no project file written yet (they open and show the clip), so there
 *   is nothing to lay out: none until their import files exist. CapCut has no import at all.
 */
import type { FcpLayout } from "./fcpxml";

export type LayoutEditor = "finalcut" | "premiere" | "resolve" | "capcut";

const SUPPORTED: Record<LayoutEditor, readonly FcpLayout[]> = {
  finalcut: ["export", "video", "day", "flat"],
  premiere: [],
  resolve: [],
  capcut: [],
};

/** The layouts this editor honours, in the order the picker lists them. Empty: show no Layout row. */
export function layoutsFor(editor: string | undefined): readonly FcpLayout[] {
  return editor && editor in SUPPORTED ? SUPPORTED[editor as LayoutEditor] : [];
}
