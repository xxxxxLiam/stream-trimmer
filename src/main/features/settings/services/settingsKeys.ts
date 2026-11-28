/**
 * File: settingsKeys.ts
 * Path: src/main/features/settings/services/settingsKeys.ts
 * Description: Which settings keys a page may write, how big a value may be, and the key main keeps for itself.
 *   The renderer writes through settings:set; anything not listed here is refused.
 */

/** Folders the app may write into. Main-only: it grows when the person picks a folder, never from a page. */
export const APPROVED_ROOTS_KEY = "clipper.approvedRoots";

/**
 * Main-only: the folder the "Add to Final Cut" library picker opens in next. Only the folder is
 * remembered, never the library itself — the library is chosen on every call (BUILD-SPEC: locations
 * can go to different assets libraries), so this is just where the dialog starts.
 */
export const ASSETS_LIBRARY_FOLDER_KEY = "clipper.assetsLibraryFolder";

/**
 * Main-only: which clip files have already been added to which Final Cut assets library, so a
 * second "Add to Final Cut" for the same library skips duplicates. Shape: { [libraryPath]: string[] }.
 */
export const ASSETS_LIBRARY_ADDED_KEY = "clipper.assetsLibraryAdded";

/** The `clipper.*` keys the renderer reads and writes today. */
export const PAGE_KEYS: ReadonlySet<string> = new Set([
  "clipper.activeCampaign",
  "clipper.appPrefs",
  "clipper.audioLanguages",
  "clipper.authSource",
  "clipper.autoUpdate",
  "clipper.bank",
  "clipper.campaignPrefs",
  "clipper.campaignSwitchSeen",
  "clipper.campaigns",
  "clipper.clipDestination",
  "clipper.clipsDir",
  "clipper.cookieBrowser",
  "clipper.cutInFlight",
  "clipper.dataDir",
  "clipper.dataDirConfirmed",
  "clipper.downloads",
  "clipper.editorHandoff",
  "clipper.editorSetupSeen",
  "clipper.fcpLastLayout",
  "clipper.fcpLastLookId",
  "clipper.fcpLookMigrated",
  "clipper.fcpLookUnread",
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
  "clipper.audioLanes",
  "clipper.videoActivity",
  "clipper.workspaces",
]);

/**
 * Largest value (as JSON) one write may carry. The bank is the biggest honest value (about 300 bytes a moment), so this
 * holds roughly 50,000 moments: years of a clipper's day. A value over it is refused AND reported (E2-4), never dropped quietly.
 */
export const MAX_VALUE_BYTES = 16_000_000;

export type WriteCheck = "ok" | "not-allowed" | "too-large";

/** Why a page may or may not write `key` = `value`, so a refusal can say which. */
export function checkPageWrite(key: unknown, value: unknown): WriteCheck {
  if (typeof key !== "string" || !PAGE_KEYS.has(key)) return "not-allowed";
  if (value === null || value === undefined) return "ok";
  try {
    const json = JSON.stringify(value);
    if (typeof json !== "string") return "not-allowed";
    return json.length <= MAX_VALUE_BYTES ? "ok" : "too-large";
  } catch {
    return "not-allowed";
  }
}

/** Whether a page may write `key` = `value`. Main's own writes go straight to the store and skip this. */
export function pageMayWrite(key: unknown, value: unknown): boolean {
  return checkPageWrite(key, value) === "ok";
}
