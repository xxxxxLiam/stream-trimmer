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

/** Nothing could be restored although the person had settings: one line, said once (E2-3). */
export function lostNote(kind: "unreadable" | "missing" | null | undefined): string {
  if (kind === "unreadable") return "Clipr couldn't read your saved settings, so it started fresh. The damaged file is kept in Clipr's data folder.";
  if (kind === "missing") return "Clipr couldn't find your saved settings, so it started fresh.";
  return "";
}

const WHAT: Record<string, string> = {
  "clipper.bank": "your bank",
  "clipper.workspaces": "your workspaces",
  "clipper.campaigns": "your campaigns",
  "clipper.downloads": "your history",
};

/** A value the app refused or failed to save: said in one line instead of being dropped (E2-4). */
export function savedRefusedNote(key: string, reason: string): string {
  const what = WHAT[key] ?? "your latest changes";
  if (reason === "too-large") return `Clipr couldn't save ${what}: there's too much to keep. Export or remove some, then try again.`;
  return `Clipr couldn't save ${what}. Check that its data folder has space and isn't read-only.`;
}
