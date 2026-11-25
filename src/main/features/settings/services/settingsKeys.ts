/**
 * File: settingsKeys.ts
 * Path: src/main/features/settings/services/settingsKeys.ts
 * Description: Which settings keys a page may write, how big a value may be, and the two keys main keeps for itself.
 *   The renderer writes through settings:set; anything not listed here is refused.
 */

/** Folders the app may write into. Main-only: it grows when the person picks a folder, never from a page. */
export const APPROVED_ROOTS_KEY = "clipper.approvedRoots";
/** When the settings were last restored from the good copy (ms). Written by main; a page may clear it once it has said so. */
export const RESTORED_KEY = "clipper.settingsRestoredFrom";

/** The `clipper.*` keys the renderer reads and writes today. */
export const PAGE_KEYS: ReadonlySet<string> = new Set([
  "clipper.activeCampaign",
  "clipper.appPrefs",
  "clipper.audioLanguages",
  "clipper.authSource",
  "clipper.autoUpdate",
  "clipper.bank",
  "clipper.campaignPrefs",
  "clipper.campaigns",
  "clipper.clipDestination",
  "clipper.clipsDir",
  "clipper.cookieBrowser",
  "clipper.dataDir",
  "clipper.dataDirConfirmed",
  "clipper.downloads",
  "clipper.editorHandoff",
  "clipper.fcpLookMigrated",
  "clipper.fcpLooks",
  "clipper.flags",
  "clipper.markerMemory",
  "clipper.panelLayout",
  "clipper.panelLayout.saved",
  "clipper.pendingReports",
  "clipper.saveDir",
  "clipper.saveDirNames",
  "clipper.saveDirs",
  "clipper.signInSkipped",
  "clipper.tips.on",
  "clipper.tips.seen",
  "clipper.transcriptLane",
  "clipper.workspaces",
  RESTORED_KEY,
]);

/** Largest value (as JSON) one write may carry. The biggest honest value is the download history. */
export const MAX_VALUE_BYTES = 2_000_000;

/** Whether a page may write `key` = `value`. Main's own writes go straight to the store and skip this. */
export function pageMayWrite(key: unknown, value: unknown): boolean {
  if (typeof key !== "string" || !PAGE_KEYS.has(key)) return false;
  if (key === RESTORED_KEY) return value === null || value === undefined; // a page may only clear it
  if (value === null || value === undefined) return true;
  try {
    const json = JSON.stringify(value);
    return typeof json === "string" && json.length <= MAX_VALUE_BYTES;
  } catch {
    return false;
  }
}
