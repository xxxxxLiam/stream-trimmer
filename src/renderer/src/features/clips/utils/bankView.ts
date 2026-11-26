/**
 * File: bankView.ts
 * Path: src/renderer/src/features/clips/utils/bankView.ts
 * Description: How the Export panel's bank is shown (board 03.2.52): sort (rating high to low by default),
 *   topic, tier and rating filters, and search words. Pure; the panel owns the state.
 */
import { filterClips, type BankedClip } from "../../../shared/utils/bank";

export type BankSortKey = "rating-desc" | "rating-asc" | "order";
export type BankView = { sort: BankSortKey; topics: readonly string[]; tiers: readonly string[]; minRating: number; words: readonly string[] };

export const DEFAULT_VIEW: BankView = { sort: "rating-desc", topics: [], tiers: [], minRating: 0, words: [] };
export const SORT_LABELS: Record<BankSortKey, string> = {
  "rating-desc": "Highest rating first",
  "rating-asc": "Lowest rating first",
  order: "Order in the video",
};

/** Filters that are on, not counting the sort or the search words. */
export const activeFilters = (v: BankView): number => v.topics.length + v.tiers.length + (v.minRating > 0 ? 1 : 0);

export function applyView(clips: readonly BankedClip[], v: BankView): BankedClip[] {
  const found = filterClips(clips, { text: v.words.join(" "), categories: v.topics, tiers: v.tiers }).filter((c) => v.minRating <= 0 || (c.rating ?? -1) >= v.minRating);
  const first = (c: BankedClip) => (c.segments.length ? Math.min(...c.segments.map((s) => s.start)) : 0);
  const rows = found.map((c, i) => ({ c, i }));
  rows.sort((a, b) => {
    if (v.sort === "order") return first(a.c) - first(b.c) || a.i - b.i;
    const ra = a.c.rating;
    const rb = b.c.rating;
    if (ra === undefined && rb === undefined) return a.i - b.i;
    if (ra === undefined) return 1; // unrated always last
    if (rb === undefined) return -1;
    return (v.sort === "rating-desc" ? rb - ra : ra - rb) || a.i - b.i;
  });
  return rows.map((r) => r.c);
}
