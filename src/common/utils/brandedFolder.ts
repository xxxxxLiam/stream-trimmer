/**
 * File: brandedFolder.ts
 * Path: src/common/utils/brandedFolder.ts
 * Description: Where a picked folder's clips actually go: the folder the person chose, exactly, for a campaign and for a
 *   location alike (Liam, 26 Nov: they already keep their own folders, so nothing is added inside). Also the safe
 *   folder-name rule shared by the renderer. Pure.
 */

/** What a download destination is: a campaign (quota, schedule, languages) or a plain location (a name and a folder). */
export type CampaignKind = "campaign" | "location";

/** Zero-width and bidi-control characters, which no one can see in a name. */
export const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/** The brand word every folder Clipr makes begins with. */
export const BRAND_FOLDER = "Clipr";

/**
 * A name as one folder name that Mac and Windows both accept: no path separators or reserved characters, no invisible
 * characters, no leading dot, no trailing dot or space (Windows cannot end a folder name with one). NFC so two spellings
 * of the same accent are one folder.
 */
export function safeFolderName(name: string, fallback = "Campaign"): string {
  const safe = String(name)
    .normalize("NFC")
    .replace(INVISIBLE_CHARS, "")
    .replace(/[\\/:*?"<>|\u0000-\u001F]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[.\s]+$/, "");
  return safe || fallback;
}

/** True for "Clipr", "clipr clips", "Clipr B-roll": a folder name that already carries the brand word. */
export function isBrandedName(folderName: string): boolean {
  return /^clipr(?:\s|$)/i.test(safeFolderName(folderName, "").trim());
}

/**
 * The folder clips go to for a folder the person picked: the folder itself, for a campaign and for a location alike
 * (Liam, 26 Nov: "Same rule"). Nothing is added inside it, because people already keep their own folders.
 * `kind`, `name` and `existing` stay in the signature for callers; none of them changes the answer now.
 * An empty `chosen` gives "" (nothing picked yet).
 */
export function brandedDir(
  chosen: string,
  _kind: CampaignKind,
  _name: string,
  _existing: readonly string[] = [],
): string {
  const base = chosen.trim();
  if (!base) return "";
  return base.replace(/(?<=.)[\\/]+$/, "");
}
