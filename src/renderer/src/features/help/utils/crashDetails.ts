/**
 * File: crashDetails.ts
 * Path: src/renderer/src/features/help/utils/crashDetails.ts
 * Description: The text a crash report carries for the error itself: what was thrown and where, ahead of the
 *   cleaned diagnostics. It never appears on screen. The report maker redacts the whole text afterwards.
 */
export function crashDetails(error: Error, diagnostics: string): string {
  const what = `Renderer crash: ${error.name || "Error"}: ${error.message || String(error)}`;
  const where = (error.stack ?? "").split("\n").slice(1, 8).join("\n");
  return [what, where, diagnostics].filter((x) => x.trim()).join("\n\n");
}

/** The main process reloads the window at ?crashed=1 after the page process died. */
export const CRASHED_ERROR = "The window stopped working";
export const wasCrashed = (search: string): boolean => new URLSearchParams(search).get("crashed") === "1";

/** The address to reopen on: the same page without the crashed flag, so the crash screen does not come back. */
export function reopenUrl(href: string): string {
  const u = new URL(href);
  u.searchParams.delete("crashed");
  return u.toString();
}
