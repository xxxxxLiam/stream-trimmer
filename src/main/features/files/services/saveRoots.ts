/**
 * File: saveRoots.ts
 * Path: src/main/features/files/services/saveRoots.ts
 * Description: Folders the user picked in the native dialog this session. Together
 *   with the folders saved in settings they are the only places the save handlers
 *   write.
 */
import { allowedRoots } from "../../../shared/utils/pathSafety";
import { getSettings } from "../../settings/services/settingsService";

const pickedDirs = new Set<string>();

export function rememberPickedDir(dir: string) {
  pickedDirs.add(dir);
}

export function saveRoots() {
  const settings = getSettings();
  return allowedRoots(settings ? settings.all() : {}, [...pickedDirs]);
}
