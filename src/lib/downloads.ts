/**
 * File: downloads.ts
 * Path: src/lib/downloads.ts
 * Description: Persisted download history store plus saved-location nicknames.
 */
import { readSetting, writeSetting } from "./persist";

const HISTORY_KEY = "clipper.downloads";
const NAMES_KEY = "clipper.saveDirNames";
const MAX_ENTRIES = 200;

export type DownloadKind = "clip" | "comments" | "export";

export interface DownloadEntry {
  id: string;
  kind: DownloadKind;
  label: string;
  path: string;
  dir: string | null;
  detail?: string;
  savedAt: number;
}

type Listener = () => void;

let entries: DownloadEntry[] = readSetting<DownloadEntry[]>(HISTORY_KEY, []);
const listeners = new Set<Listener>();

function emit(): void {
  writeSetting(HISTORY_KEY, entries);
  listeners.forEach((l) => l());
}

export function subscribeDownloads(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getDownloads(): DownloadEntry[] {
  return entries;
}

export function addDownload(
  entry: Omit<DownloadEntry, "id" | "savedAt">,
): void {
  const next: DownloadEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    savedAt: Date.now(),
  };
  entries = [next, ...entries].slice(0, MAX_ENTRIES);
  emit();
}

export function removeDownload(id: string): void {
  entries = entries.filter((e) => e.id !== id);
  emit();
}

export function clearDownloads(): void {
  entries = [];
  emit();
}

// --- Saved-location nicknames -------------------------------------------

export function readSaveDirNames(): Record<string, string> {
  return readSetting<Record<string, string>>(NAMES_KEY, {});
}

export function writeSaveDirNames(names: Record<string, string>): void {
  writeSetting(NAMES_KEY, names);
}

export function folderName(dir: string): string {
  const parts = dir.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || dir;
}

export function displayDirName(
  dir: string,
  names: Record<string, string>,
): string {
  const custom = names[dir];
  return custom && custom.trim() ? custom : folderName(dir);
}
