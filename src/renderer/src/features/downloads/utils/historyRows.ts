/**
 * File: historyRows.ts
 * Path: src/renderer/src/features/downloads/utils/historyRows.ts
 * Description: Pure helpers for the History panel: only clips, grouped by day, narrowed by search
 *   pills, with the row's second line and the count text as on the board.
 */
import type { DownloadEntry } from "../../../shared/utils/downloads";
import { formatLength } from "../../../shared/utils/segments";

export type DayGroup = { key: string; label: string; entries: DownloadEntry[] };

const startOfDay = (ts: number) => {
  const d = new Date(ts);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
};

export function dayLabel(ts: number, now: number): string {
  const diff = Math.round((startOfDay(now) - startOfDay(ts)) / 86_400_000);
  if (diff <= 0) return "Today";
  if (diff === 1) return "Yesterday";
  return new Date(ts).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/** History lists clips only; comment and channel exports are not clips. */
export function historyClips(entries: readonly DownloadEntry[]): DownloadEntry[] {
  return entries.filter((e) => e.kind === "clip");
}

/** Every pill must match somewhere in the row's label, campaign or video (case-insensitive). */
export function filterHistory(entries: readonly DownloadEntry[], pills: readonly string[]): DownloadEntry[] {
  const needles = pills.map((p) => p.trim().toLowerCase()).filter(Boolean);
  if (needles.length === 0) return [...entries];
  return entries.filter((e) => {
    const hay = [e.label, e.campaign, e.videoTitle].filter(Boolean).join(" ").toLowerCase();
    return needles.every((n) => hay.includes(n));
  });
}

/** Newest first, grouped by calendar day. */
export function groupByDay(entries: readonly DownloadEntry[], now: number): DayGroup[] {
  const sorted = [...entries].sort((a, b) => b.savedAt - a.savedAt);
  const groups: DayGroup[] = [];
  for (const e of sorted) {
    const key = String(startOfDay(e.savedAt));
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.entries.push(e);
    else groups.push({ key, label: dayLabel(e.savedAt, now), entries: [e] });
  }
  return groups;
}

/** "0:42 · Acme · 09:12": length, campaign, time of day; parts we don't know are left out. */
export function rowMeta(e: DownloadEntry): string {
  const time = new Date(e.savedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return [e.seconds === undefined ? "" : formatLength(e.seconds), e.campaign ?? "", time].filter(Boolean).join(" · ");
}

export function countText(n: number): string {
  return `${n} ${n === 1 ? "clip" : "clips"}`;
}
