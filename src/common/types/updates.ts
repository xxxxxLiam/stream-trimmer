/**
 * File: updates.ts
 * Path: src/common/types/updates.ts
 * Description: Shapes the main process sends the renderer for app updates. The top bar's
 *   "Restart to update" pill reads UpdateReady and calls restart-to-update; nothing here
 *   ever opens a dialog.
 */

/**
 * Pushed once when a new version is ready. On Windows and Linux it has downloaded and the pill
 * reads "Restart to update" (mode "restart"). On the unsigned Mac build nothing installs in
 * place, so the pill reads "Get version <x>" and opens `url` (mode "download").
 */
export type UpdateReady =
  | { version: string; mode: "restart" }
  | { version: string; mode: "download"; url: string };

/** Answer to "restart to update now". `busy` means a clip is being made: the pill stays and waits. */
export type RestartToUpdateResult =
  | { ok: true }
  | { ok: false; reason: "busy" | "nothing-ready" | "failed"; error?: string };

/** The Settings row "Update automatically". On unless the user turned it off. */
export const AUTO_UPDATE_SETTING = "clipper.autoUpdate";

export function autoUpdateEnabled(settings: Record<string, unknown> | undefined): boolean {
  return settings?.[AUTO_UPDATE_SETTING] !== false;
}
