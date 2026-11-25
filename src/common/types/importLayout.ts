/**
 * File: importLayout.ts
 * Path: src/common/types/importLayout.ts
 * Description: How a campaign's clips are laid out when they reach the editor. The campaign stores one id
 *   (`fcpLayout`); the renderer picks it and previews it, the main process writes it. Final Cut first.
 */
export const IMPORT_LAYOUTS = ["export-event", "event-per-video", "event-per-day", "flat"] as const;
export type ImportLayoutId = (typeof IMPORT_LAYOUTS)[number];

/** A: one "Export" event with a keyword collection per source video. */
export const DEFAULT_IMPORT_LAYOUT: ImportLayoutId = "export-event";

export const isImportLayout = (v: unknown): v is ImportLayoutId => typeof v === "string" && (IMPORT_LAYOUTS as readonly string[]).includes(v);
