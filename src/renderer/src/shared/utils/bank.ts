/**
 * File: bank.ts
 * Path: src/renderer/src/shared/utils/bank.ts
 * Description: The clip bank (BUILD-SPEC 12b and A1): banked clips per (campaignId, videoId),
 *   persisted locally so they survive closing the app. Pure functions over a plain data
 *   object, plus a small store that loads and saves it. Known categories and tiers are
 *   collected from what was imported, never preset. Cutting a clip flips its status and
 *   hands back the ranges to append to the campaign's usedRanges.
 */
import { addUsedRanges, type Campaign } from "./campaigns";
import type { ParsedClip } from "./bankImport";
import { readSetting, writeSetting } from "./persist";
import { bandStatus, totalDuration, type Band, type BandStatus, type NamedRange, type Segment } from "./segments";

export type BankStatus = "banked" | "cut" | "published";

export type BankedClip = {
  id: string;
  label: string;
  segments: Segment[];
  status: BankStatus;
  category?: string;
  tier?: string;
  /** Rating from the import, 0 to 10. */
  rating?: number;
  note?: string;
  /** An imported or typed out point was past the video's end and was moved to it: the end, in seconds. Goes when the clip is opened. */
  ranPastEnd?: number;
};

/** campaignId -> videoId -> clips, in import order. */
export type BankData = Record<string, Record<string, BankedClip[]>>;

export const BANK_KEY = "clipper.bank";

const STATUSES: readonly BankStatus[] = ["banked", "cut", "published"];

function cleanSegments(raw: unknown): Segment[] {
  if (!Array.isArray(raw)) return [];
  const out: Segment[] = [];
  for (const s of raw) {
    const start = Number((s as Segment)?.start);
    const end = Number((s as Segment)?.end);
    if (Number.isFinite(start) && Number.isFinite(end) && end > start && start >= 0) {
      out.push({ start, end });
    }
  }
  return out;
}

/** Defensive load: anything malformed is dropped rather than thrown. */
export function normalizeBank(raw: unknown): BankData {
  const out: BankData = {};
  if (!raw || typeof raw !== "object") return out;
  for (const [campaignId, videos] of Object.entries(raw as Record<string, unknown>)) {
    if (!videos || typeof videos !== "object") continue;
    for (const [videoId, list] of Object.entries(videos as Record<string, unknown>)) {
      if (!Array.isArray(list)) continue;
      const clips: BankedClip[] = [];
      for (const c of list) {
        if (!c || typeof c !== "object") continue;
        const r = c as Record<string, unknown>;
        const segments = cleanSegments(r.segments);
        if (typeof r.id !== "string" || !r.id || !segments.length) continue;
        const clip: BankedClip = {
          id: r.id,
          label: typeof r.label === "string" ? r.label : "",
          segments,
          status: STATUSES.includes(r.status as BankStatus) ? (r.status as BankStatus) : "banked",
        };
        if (typeof r.category === "string" && r.category) clip.category = r.category;
        if (typeof r.tier === "string" && r.tier) clip.tier = r.tier;
        if (typeof r.rating === "number" && Number.isFinite(r.rating)) clip.rating = r.rating;
        if (typeof r.note === "string" && r.note) clip.note = r.note;
        if (typeof r.ranPastEnd === "number" && Number.isFinite(r.ranPastEnd) && r.ranPastEnd > 0) clip.ranPastEnd = r.ranPastEnd;
        if (!clips.some((x) => x.id === r.id)) clips.push(clip);
      }
      if (clips.length) (out[campaignId] ??= {})[videoId] = clips;
    }
  }
  return out;
}

export function clipsFor(data: BankData, campaignId: string, videoId: string): BankedClip[] {
  return data[campaignId]?.[videoId] ?? [];
}

function withClips(data: BankData, campaignId: string, videoId: string, clips: BankedClip[]): BankData {
  const videos = { ...(data[campaignId] ?? {}) };
  if (clips.length) videos[videoId] = clips;
  else delete videos[videoId];
  const next = { ...data };
  if (Object.keys(videos).length) next[campaignId] = videos;
  else delete next[campaignId];
  return next;
}

/** Drops a campaign's whole bank, for when the campaign itself is removed. */
export function removeCampaignBank(data: BankData, campaignId: string): BankData {
  if (!(campaignId in data)) return data;
  const next = { ...data };
  delete next[campaignId];
  return next;
}

/** Next free id of the form B01, B02 ... within a video's bank. */
export function nextBankId(existing: readonly { id: string }[], taken: ReadonlySet<string> = new Set()): string {
  const used = new Set([...existing.map((c) => c.id.toLowerCase()), ...[...taken].map((t) => t.toLowerCase())]);
  for (let n = 1; ; n++) {
    const id = `B${String(n).padStart(2, "0")}`;
    if (!used.has(id.toLowerCase())) return id;
  }
}

function sameSegments(a: readonly Segment[], b: readonly Segment[]): boolean {
  return a.length === b.length && a.every((s, i) => s.start === b[i].start && s.end === b[i].end);
}

export type ImportResult = {
  data: BankData;
  added: number;
  /** Banked clips whose fields were replaced by the paste (same id, or same ranges). */
  updated: number;
  /** Matches that were already cut or published, left exactly as they were. */
  skipped: number;
};

/**
 * Merge parsed clips into a video's bank. A clip matches an existing one by id, or, when
 * the paste gave no id, by identical ranges, so pasting the same list twice changes nothing.
 * Cut and published clips are never rewritten.
 */
export function importClips(
  data: BankData,
  campaignId: string,
  videoId: string,
  parsed: readonly ParsedClip[],
): ImportResult {
  const list = [...clipsFor(data, campaignId, videoId)];
  const pasteIds = new Set(parsed.map((p) => p.id).filter((x): x is string => !!x));
  let added = 0;
  let updated = 0;
  let skipped = 0;
  for (const p of parsed) {
    const idx = list.findIndex((c) =>
      p.id ? c.id.toLowerCase() === p.id.toLowerCase() : sameSegments(c.segments, p.segments),
    );
    const fields = (id: string, status: BankStatus): BankedClip => {
      const clip: BankedClip = {
        id,
        label: p.label,
        segments: p.segments.map((s) => ({ ...s })),
        status,
      };
      if (p.category) clip.category = p.category;
      if (p.tier) clip.tier = p.tier;
      if (p.note) clip.note = p.note;
      if (typeof p.rating === "number") clip.rating = p.rating;
      if (typeof p.ranPastEnd === "number") clip.ranPastEnd = p.ranPastEnd;
      return clip;
    };
    if (idx >= 0) {
      if (list[idx].status !== "banked") skipped++;
      else {
        list[idx] = fields(list[idx].id, "banked");
        updated++;
      }
    } else {
      list.push(fields(p.id ?? nextBankId(list, pasteIds), "banked"));
      added++;
    }
  }
  return { data: withClips(data, campaignId, videoId, list), added, updated, skipped };
}

export function setStatus(
  data: BankData,
  campaignId: string,
  videoId: string,
  clipId: string,
  status: BankStatus,
): BankData {
  const list = clipsFor(data, campaignId, videoId);
  if (!list.some((c) => c.id === clipId)) return data;
  return withClips(
    data,
    campaignId,
    videoId,
    list.map((c) => (c.id === clipId ? { ...c, status } : c)),
  );
}

export function removeClip(data: BankData, campaignId: string, videoId: string, clipId: string): BankData {
  const list = clipsFor(data, campaignId, videoId);
  if (!list.some((c) => c.id === clipId)) return data;
  return withClips(data, campaignId, videoId, list.filter((c) => c.id !== clipId));
}

export function setNote(data: BankData, campaignId: string, videoId: string, clipId: string, note: string): BankData {
  const list = clipsFor(data, campaignId, videoId);
  return withClips(
    data,
    campaignId,
    videoId,
    list.map((c) => {
      if (c.id !== clipId) return c;
      const { note: _old, ...rest } = c;
      return note.trim() ? { ...rest, note: note.trim() } : rest;
    }),
  );
}

/** The "ran past the end" line has done its job once the clip is opened or changed. */
export function clearRanPastEnd(data: BankData, campaignId: string, videoId: string, clipId: string): BankData {
  const list = clipsFor(data, campaignId, videoId);
  if (!list.some((c) => c.id === clipId && c.ranPastEnd !== undefined)) return data;
  return withClips(data, campaignId, videoId, list.map((c) => {
    if (c.id !== clipId) return c;
    const { ranPastEnd: _gone, ...rest } = c;
    return rest;
  }));
}

export type CutResult = { data: BankData; clip: BankedClip; ranges: Segment[] };

/** Flip a clip to `cut` and return the ranges that must be appended to usedRanges. Null when there is no such clip. */
export function markCut(data: BankData, campaignId: string, videoId: string, clipId: string): CutResult | null {
  const clip = clipsFor(data, campaignId, videoId).find((c) => c.id === clipId);
  if (!clip) return null;
  const next = setStatus(data, campaignId, videoId, clipId, "cut");
  return { data: next, clip: { ...clip, status: "cut" }, ranges: clip.segments.map((s) => ({ ...s })) };
}

/** The whole step on cut: status flips and the ranges join the campaign's usedRanges under the clip id. */
export function applyCut(
  data: BankData,
  campaign: Campaign,
  videoId: string,
  clipId: string,
): { data: BankData; campaign: Campaign } | null {
  const res = markCut(data, campaign.id, videoId, clipId);
  if (!res) return null;
  return { data: res.data, campaign: addUsedRanges(campaign, videoId, res.ranges, clipId) };
}

// ---- facets, filter, sort ---------------------------------------------------

/** Numeric-aware order: 1, 2, 10, then words. */
export function compareTier(a: string | undefined, b: string | undefined): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const na = /^\d+$/.test(a) ? Number(a) : null;
  const nb = /^\d+$/.test(b) ? Number(b) : null;
  if (na !== null && nb !== null) return na - nb;
  if (na !== null) return -1;
  if (nb !== null) return 1;
  return a.localeCompare(b);
}

export type Facets = { categories: string[]; tiers: string[] };

/** Every category and tier that appears in a campaign's bank, so filter chips need no setup. Case-insensitive; first spelling wins. */
export function facets(data: BankData, campaignId: string): Facets {
  const cats = new Map<string, string>();
  const tiers = new Map<string, string>();
  for (const list of Object.values(data[campaignId] ?? {})) {
    for (const c of list) {
      if (c.category && !cats.has(c.category.toLowerCase())) cats.set(c.category.toLowerCase(), c.category);
      if (c.tier && !tiers.has(c.tier.toLowerCase())) tiers.set(c.tier.toLowerCase(), c.tier);
    }
  }
  return {
    categories: [...cats.values()].sort((a, b) => a.localeCompare(b)),
    tiers: [...tiers.values()].sort(compareTier),
  };
}

export type BankFilter = {
  text?: string;
  /** Empty or absent means all. Several selected values match any of them. */
  categories?: readonly string[];
  tiers?: readonly string[];
};

export function filterClips(clips: readonly BankedClip[], f: BankFilter): BankedClip[] {
  const q = (f.text ?? "").trim().toLowerCase();
  const cats = (f.categories ?? []).map((c) => c.toLowerCase());
  const tiers = (f.tiers ?? []).map((t) => t.toLowerCase());
  return clips.filter((c) => {
    if (cats.length && !(c.category && cats.includes(c.category.toLowerCase()))) return false;
    if (tiers.length && !(c.tier && tiers.includes(c.tier.toLowerCase()))) return false;
    if (!q) return true;
    const hay = [c.id, c.label, c.category, c.tier, c.note].filter(Boolean).join(" ").toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  });
}

export type BankSort = "order" | "tier" | "time";

export function sortClips(clips: readonly BankedClip[], by: BankSort): BankedClip[] {
  const indexed = clips.map((c, i) => ({ c, i }));
  const first = (c: BankedClip) => (c.segments.length ? Math.min(...c.segments.map((s) => s.start)) : 0);
  indexed.sort((x, y) => {
    if (by === "tier") return compareTier(x.c.tier, y.c.tier) || x.i - y.i;
    if (by === "time") return first(x.c) - first(y.c) || x.i - y.i;
    return x.i - y.i;
  });
  return indexed.map((x) => x.c);
}

/** Ranges of clips still waiting to be cut, for the hollow outlines on the timeline. */
export function bankedRanges(clips: readonly BankedClip[]): NamedRange[] {
  const out: NamedRange[] = [];
  for (const c of clips) {
    if (c.status !== "banked") continue;
    for (const s of c.segments) out.push({ start: s.start, end: s.end, clipId: c.id, label: c.label });
  }
  return out;
}

export function clipLength(c: Pick<BankedClip, "segments">): number {
  return totalDuration(c.segments);
}

export function clipBand(c: Pick<BankedClip, "segments">, band: Band | null | undefined): { status: BandStatus; deltaSec: number } {
  return bandStatus(clipLength(c), band);
}

// ---- store ------------------------------------------------------------------

export type BankIO = { load: () => unknown; save: (data: BankData) => void };

export type BankStore = {
  get: () => BankData;
  subscribe: (l: () => void) => () => void;
  importClips: (campaignId: string, videoId: string, parsed: readonly ParsedClip[]) => ImportResult;
  markCut: (campaignId: string, videoId: string, clipId: string) => CutResult | null;
  setStatus: (campaignId: string, videoId: string, clipId: string, status: BankStatus) => void;
  remove: (campaignId: string, videoId: string, clipId: string) => void;
  setNote: (campaignId: string, videoId: string, clipId: string, note: string) => void;
  clearRanPastEnd: (campaignId: string, videoId: string, clipId: string) => void;
  /** Forget everything banked under a campaign (it was removed). */
  removeCampaign: (campaignId: string) => void;
};

export function createBankStore(io: BankIO): BankStore {
  let data = normalizeBank(io.load());
  const listeners = new Set<() => void>();
  const commit = (next: BankData) => {
    if (next === data) return;
    data = next;
    io.save(next);
    listeners.forEach((l) => l());
  };
  return {
    get: () => data,
    subscribe: (l) => {
      listeners.add(l);
      return () => {
        listeners.delete(l);
      };
    },
    importClips: (c, v, parsed) => {
      const res = importClips(data, c, v, parsed);
      commit(res.data);
      return res;
    },
    markCut: (c, v, id) => {
      const res = markCut(data, c, v, id);
      if (res) commit(res.data);
      return res;
    },
    setStatus: (c, v, id, s) => commit(setStatus(data, c, v, id, s)),
    remove: (c, v, id) => commit(removeClip(data, c, v, id)),
    setNote: (c, v, id, n) => commit(setNote(data, c, v, id, n)),
    clearRanPastEnd: (c, v, id) => commit(clearRanPastEnd(data, c, v, id)),
    removeCampaign: (c) => commit(removeCampaignBank(data, c)),
  };
}

/** The app's store, backed by the settings file (desktop) or localStorage (browser). */
export const bankStore: BankStore = createBankStore({
  load: () => readSetting<unknown>(BANK_KEY, {}),
  save: (d) => writeSetting(BANK_KEY, d),
});
