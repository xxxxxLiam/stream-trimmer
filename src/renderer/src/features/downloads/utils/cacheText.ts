/**
 * File: cacheText.ts
 * Path: src/renderer/src/features/downloads/utils/cacheText.ts
 * Description: The words for the unfinished-downloads line at the foot of History.
 */
export function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

/** Says what Clear leaves alone, so nobody fears it deletes finished work. */
export function cacheNote(bytes: number): string {
  return `${formatBytes(bytes)} of unfinished downloads kept so a failed cut can resume. Clearing leaves anything still running, and clips waiting to be saved, alone.`;
}
