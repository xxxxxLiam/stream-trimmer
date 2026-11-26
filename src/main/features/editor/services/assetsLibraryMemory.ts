/**
 * File: assetsLibraryMemory.ts
 * Path: src/main/features/editor/services/assetsLibraryMemory.ts
 * Description: Main's own settings I/O for "Add to Final Cut": the folder the library picker opens
 *   in next, and the per-library duplicate record (see assetsLibraryRecord.ts for the pure logic).
 *   Both keys are main-only (not in PAGE_KEYS): a page never writes them directly.
 */
import path from "node:path";
import { getSettings } from "../../settings/services/settingsService";
import { ASSETS_LIBRARY_ADDED_KEY, ASSETS_LIBRARY_FOLDER_KEY } from "../../settings/services/settingsKeys";
import { newClips, withAdded, type AssetsLibraryRecord } from "./assetsLibraryRecord";

/** The folder the assets-library picker should open in, or null for the picker's own default. */
export function lastAssetsLibraryFolder(): string | null {
  const settings = getSettings();
  const value = settings ? settings.all()[ASSETS_LIBRARY_FOLDER_KEY] : null;
  return typeof value === "string" && value.length > 0 ? value : null;
}

/** Remembers the folder a library was just picked from, for next time. */
export function rememberAssetsLibraryFolder(libraryPath: string) {
  const settings = getSettings();
  if (!settings) return;
  settings.set(ASSETS_LIBRARY_FOLDER_KEY, path.dirname(libraryPath));
}

function record(): AssetsLibraryRecord {
  const settings = getSettings();
  const value = settings ? settings.all()[ASSETS_LIBRARY_ADDED_KEY] : null;
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

/** Of `files`, the ones not already added to `library`. */
export function unaddedAssetsLibraryClips(library: unknown, files: string[]): string[] {
  return newClips(record(), library, files);
}

/** Records `files` as now added to `library`. */
export function recordAssetsLibraryClips(library: unknown, files: string[]) {
  const settings = getSettings();
  if (!settings) return;
  settings.set(ASSETS_LIBRARY_ADDED_KEY, withAdded(record(), library, files));
}
