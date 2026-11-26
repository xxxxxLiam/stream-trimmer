/**
 * File: assetsLibraryRecord.ts
 * Path: src/main/features/editor/services/assetsLibraryRecord.ts
 * Description: Which clip files have already been added to which Final Cut assets library, so a
 *   repeat "Add to Final Cut" for the same library skips duplicates (BUILD-SPEC: the library is
 *   chosen on every call, so duplicates are tracked per library, not globally). Pure: both
 *   functions take the whole record and return a new one; nothing here touches disk or settings.
 */

export type AssetsLibraryRecord = Record<string, string[]>;

function normalizeLibrary(library: unknown): string | null {
  return typeof library === "string" && library.length > 0 ? library : null;
}

/** `files` with anything already recorded as added to `library` removed. An unknown library keeps every file. */
export function newClips(record: AssetsLibraryRecord, library: unknown, files: string[]): string[] {
  const key = normalizeLibrary(library);
  if (!key) return files;
  const added = new Set(record[key] || []);
  return files.filter((f) => !added.has(f));
}

/** A new record with `files` merged into `library`'s list. Never mutates `record`. */
export function withAdded(record: AssetsLibraryRecord, library: unknown, files: string[]): AssetsLibraryRecord {
  const key = normalizeLibrary(library);
  if (!key || files.length === 0) return record;
  const existing = new Set(record[key] || []);
  for (const f of files) existing.add(f);
  return { ...record, [key]: [...existing] };
}
