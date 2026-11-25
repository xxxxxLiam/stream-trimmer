/**
 * File: editorSummary.ts
 * Path: src/renderer/src/features/settings/utils/editorSummary.ts
 * Description: The dim line under the editor button in a campaign's settings: what is set, in one glance.
 *   Final Cut reads "library · event · layout · look"; an unset part is left out, never shown as blank.
 *   Premiere and Resolve have nothing set per campaign yet, so their line says what Clip does.
 */
import { DEFAULT_EXPORT_EVENT, type FcpLayout } from "../../../shared/utils/fcpxml";
import { layoutName } from "./importLayouts";

export type EditorId = "premiere" | "finalcut" | "resolve";

/** The editors with a settings page: every one in the Clip menu except CapCut, which has nothing to set. */
export function hasEditorPage(destination: string): destination is EditorId {
  return destination === "premiere" || destination === "finalcut" || destination === "resolve";
}

export function finalCutSummary(s: { library: string; event: string; layout: FcpLayout; look: string }): string {
  const showsEvent = s.layout === "export" || s.layout === "flat";
  return [s.library, showsEvent ? s.event || DEFAULT_EXPORT_EVENT : "", layoutName(s.layout), s.look].filter(Boolean).join(" · ");
}

export function editorSummary(id: EditorId, label: string, finalCut: string): string {
  return id === "finalcut" ? finalCut || "Not set up yet" : `Clip opens the saved clip in ${label}`;
}
