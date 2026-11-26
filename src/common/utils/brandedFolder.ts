/**
 * File: brandedFolder.ts
 * Path: src/common/utils/brandedFolder.ts
 * Description: Where a picked folder's clips actually go. A campaign pick becomes
 *   `<chosen>/Clipr clips/<Campaign>`; a location pick becomes `<chosen>/Clipr <Name>`. A folder that already
 *   carries the Clipr name is reused, never nested inside a second "Clipr". Pure: the main process passes the names
 *   already inside the chosen folder so an existing folder is reused whatever its letter case.
 */

/** What a download destination is: a campaign (quota, schedule, languages) or a plain location (a name and a folder). */
export type CampaignKind = "campaign" | "location";

/** Zero-width and bidi-control characters, which no one can see in a name. */
export const INVISIBLE_CHARS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g;

/** The brand word every folder Clipr makes begins with. */
export const BRAND_FOLDER = "Clipr";
/** The folder a campaign pick gets inside the chosen folder. */
export const CAMPAIGN_ROOT_FOLDER = `${BRAND_FOLDER} clips`;

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

function lastSegment(dir: string): string {
  const parts = dir.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] ?? "";
}

function join(base: string, leaf: string): string {
  const b = base.replace(/[\\/]+$/, "");
  const sep = b.includes("\\") && !b.includes("/") ? "\\" : "/";
  return `${b}${sep}${leaf}`;
}

function key(name: string): string {
  return safeFolderName(name, "").toLowerCase();
}

/** The folder already in `existing` that has this name (any letter case), else the name as given. */
function reuse(leaf: string, existing: readonly string[]): string {
  return existing.find((e) => key(e) === key(leaf)) ?? leaf;
}

/**
 * The folder clips go to for a folder the person picked.
 *  - campaign: `<chosen>/Clipr clips/<Campaign>`; if the chosen folder is already a Clipr folder, `<chosen>/<Campaign>`.
 *  - location: `<chosen>/Clipr <Name>`; if the chosen folder is already a Clipr folder, the chosen folder itself.
 * `existing` is the folder names already inside `chosen`; a match there (any letter case) is reused as spelled.
 * An empty `chosen` gives "" (nothing picked yet).
 */
export function brandedDir(
  chosen: string,
  kind: CampaignKind,
  name: string,
  existing: readonly string[] = [],
): string {
  const base = chosen.trim();
  if (!base) return "";
  if (isBrandedName(lastSegment(base))) {
    return kind === "location" ? base.replace(/(?<=.)[\\/]+$/, "") : join(base, safeFolderName(name));
  }
  if (kind === "location") {
    const folder = safeFolderName(name, "Location");
    // A name that already starts with "Clipr" is not given the brand word a second time.
    return join(base, reuse(isBrandedName(folder) ? folder : `${BRAND_FOLDER} ${folder}`, existing));
  }
  return join(join(base, reuse(CAMPAIGN_ROOT_FOLDER, existing)), safeFolderName(name));
}
