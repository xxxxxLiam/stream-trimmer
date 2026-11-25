/**
 * File: saveRoots.ts
 * Path: src/main/features/files/services/saveRoots.ts
 * Description: Folders the person picked in the native dialog. Main keeps them as its own list in settings
 *   (a page cannot write that key); together with this session's picks they are the only places the save
 *   handlers write.
 */
import { allowedRoots } from "../../../shared/utils/pathSafety";
import { getSettings } from "../../settings/services/settingsService";
import { APPROVED_ROOTS_KEY } from "../../settings/services/settingsKeys";

const pickedDirs = new Set<string>();

/** A folder the person chose in the native dialog: allowed now, and kept in main's own list for next time. */
export function rememberPickedDir(dir: string) {
  pickedDirs.add(dir);
  const settings = getSettings();
  if (!settings) return;
  const current = settings.all()[APPROVED_ROOTS_KEY];
  const list: string[] = Array.isArray(current) ? current.filter((x: unknown) => typeof x === "string") : [];
  if (!list.includes(dir)) settings.set(APPROVED_ROOTS_KEY, [...list, dir]);
}

/** The folders a save may land in: the approved list main keeps, plus this session's picks. Never read from what a page can write. */
export function saveRoots() {
  const settings = getSettings();
  const approved = settings ? settings.all()[APPROVED_ROOTS_KEY] : [];
  return allowedRoots({}, [...(Array.isArray(approved) ? approved : []), ...pickedDirs]);
}
