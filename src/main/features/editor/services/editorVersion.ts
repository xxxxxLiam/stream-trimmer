/**
 * File: editorVersion.ts
 * Path: src/main/features/editor/services/editorVersion.ts
 * Description: Newest-first ordering for installed editor names such as
 *   "Adobe Premiere Pro 2025" and "Adobe Premiere Pro CC 2019". The year (or
 *   version number) in the name decides, never the letters around it.
 */

/** The version number in a name: its biggest number, or -1 when it has none ("Premiere Pro (Beta)"). */
function versionOf(name: string): number {
  const numbers = name.match(/\d+(?:\.\d+)?/g);
  return numbers ? Math.max(...numbers.map(Number)) : -1;
}

/** Sort comparator: highest version first, so "2025" beats "CC 2019" and "10" beats "9". */
export function newestFirst(a: string, b: string): number {
  return versionOf(b) - versionOf(a) || b.localeCompare(a, undefined, { numeric: true });
}
