/**
 * File: restoredNote.ts
 * Path: src/renderer/src/features/settings/utils/restoredNote.ts
 * Description: The one quiet line shown on launch when the engine restored the settings from the backup.
 */
export function restoredNote(iso: string | null | undefined, locale?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Clipr restored your settings from a backup.";
  return `Clipr restored your settings from ${d.toLocaleString(locale, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}.`;
}
