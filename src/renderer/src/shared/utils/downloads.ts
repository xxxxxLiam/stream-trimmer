/**
 * File: downloads.ts
 * Path: src/renderer/src/shared/utils/downloads.ts
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
  /** Set after a clip is made, for the History row: campaign, length, and where it came from. */
  campaign?: string;
  campaignId?: string;
  /** The id the clip was made under (bank id or campaign clip id); Undo gives its ranges back. */
  clipId?: string;
  segments?: { start: number; end: number }[];
  seconds?: number;
  videoId?: string;
  videoTitle?: string;
  startSec?: number;
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

/** Adds what only the screen knows (campaign, length, source) to an entry just saved. */
export function annotateDownload(
  id: string,
  extra: Pick<DownloadEntry, "campaign" | "campaignId" | "clipId" | "segments" | "seconds" | "videoId" | "videoTitle" | "startSec">,
): void {
  entries = entries.map((e) => (e.id === id ? { ...e, ...extra } : e));
  emit();
}

/** The clip's name without its file extension ("Honest Version.mp4" is "Honest Version"). */
export function clipTitle(label: string): string {
  return label.replace(/\.[A-Za-z0-9]{2,4}$/, "");
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
