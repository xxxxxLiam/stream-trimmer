/**
 * File: campaigns.ts
 * Path: src/renderer/src/shared/utils/campaigns.ts
 * Description: Campaign model and pure operations (BUILD-SPEC section 5). No preset
 *   campaigns ship: the app starts empty. Everything here is pure and returns new
 *   values, so the context only has to store the result.
 */

/** A source-video range already used by a published clip. Seconds. */
export type UsedRange = {
  start: number;
  end: number;
  clipId: string;
  /** When the clip was made (ms since epoch). Older entries have none and never count as "today". */
  at?: number;
};

export type CampaignFormat = "mp4" | "mp3";

export type Campaign = {
  id: string;
  name: string;
  /** Length band, seconds. */
  targetMinSec: number;
  targetMaxSec: number;
  hardMaxSec: number;
  /** Tokens: {prefix}, {videoId}, {nn} (zero padded), {n}. */
  clipIdPattern: string;
  /** Fills {prefix} in the pattern. */
  prefix: string;
  format: CampaignFormat;
  quality: string;
  /** Where cut clips go (deliverables). */
  clipsDir: string;
  /** Where channel-export CSVs go (research). Never the same folder as clipsDir. */
  dataDir: string;
  usedRanges: Record<string, UsedRange[]>;
  /** Clips due per day. Unset or 0 means no quota, and the top bar shows no "today" count. */
  dailyQuota?: number;
  /** Id of this campaign's Final Cut look in the saved looks (fcpLooks.ts); none when unset. */
  fcpLookId?: string;
};

export type CampaignInput = Partial<Omit<Campaign, "id" | "usedRanges">> & {
  name: string;
};

export const DEFAULT_PATTERN = "{prefix}-{videoId}-{nn}";
export const DEFAULT_BAND = { targetMinSec: 30, targetMaxSec: 60, hardMaxSec: 90 };

/** Letters and digits of the name's words, upper case, at most 3 characters. */
export function defaultPrefix(name: string): string {
  const words = name.trim().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length === 0) return "C";
  const letters =
    words.length === 1 ? words[0].slice(0, 2) : words.map((w) => w[0]).join("").slice(0, 3);
  return letters.toUpperCase();
}

/**
 * A fresh campaign id. It is deliberately NOT derived from the name: a name can be reused
 * (delete "Acme Q4", create "Acme Q4" again) but an id must never be, or the new campaign
 * would adopt whatever is still stored under the old one's key. Ids already in settings.json
 * (older versions used a slug of the name) are opaque strings and keep working unchanged.
 */
export function newCampaignId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw =
    typeof c?.randomUUID === "function"
      ? c.randomUUID()
      : Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 8)).join("");
  return `c-${raw.replace(/-/g, "").slice(0, 16)}`;
}

function uniqueId(list: readonly Campaign[], makeId: () => string): string {
  const taken = new Set(list.map((c) => c.id));
  let id = makeId();
  while (taken.has(id)) id = makeId();
  return id;
}

/** `name` made different from every other campaign's name ("Acme Q4" -> "Acme Q4 2"). */
export function uniqueName(list: readonly Campaign[], name: string, exceptId?: string): string {
  const taken = new Set(
    list.filter((c) => c.id !== exceptId).map((c) => c.name.trim().toLowerCase()),
  );
  if (!taken.has(name.trim().toLowerCase())) return name;
  let i = 2;
  while (taken.has(`${name} ${i}`.toLowerCase())) i += 1;
  return `${name} ${i}`;
}

/** Keeps the band ordered: min <= max <= hardMax, all non-negative. */
export function normalizeBand<T extends Pick<Campaign, "targetMinSec" | "targetMaxSec" | "hardMaxSec">>(
  c: T,
): T {
  const min = Math.max(0, Number.isFinite(c.targetMinSec) ? c.targetMinSec : 0);
  const max = Math.max(min, Number.isFinite(c.targetMaxSec) ? c.targetMaxSec : min);
  const hard = Math.max(max, Number.isFinite(c.hardMaxSec) ? c.hardMaxSec : max);
  return { ...c, targetMinSec: min, targetMaxSec: max, hardMaxSec: hard };
}

import { CHANNEL_DATA_BUILT } from "./ownerGate";
import { siblingDir } from "../../../../common/utils/siblingDir";

/**
 * Name of the suggested data folder. The exporter's own name only exists in a build that
 * has the exporter; a public build must not carry it, so it falls back to a plain "data".
 */
export const DATA_FOLDER_NAME: string = CHANNEL_DATA_BUILT ? "channel-data" : "data";

/** "/a/b/clips" -> "/a/b/<data folder>". Keeps the separator style of the input. */
export function defaultDataDir(clipsDir: string): string {
  return siblingDir(clipsDir, DATA_FOLDER_NAME);
}

function normFolder(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function sameFolder(a: string, b: string): boolean {
  return a !== "" && b !== "" && normFolder(a) === normFolder(b);
}

export type CampaignProblem = "name-empty" | "name-taken" | "folders-same" | "pattern-no-number";

export function validateCampaign(
  c: Pick<Campaign, "name" | "clipsDir" | "dataDir" | "clipIdPattern">,
  /** The other campaigns (not the one being edited); when given, a repeated name is a problem. */
  others?: readonly Pick<Campaign, "name">[],
): CampaignProblem[] {
  const out: CampaignProblem[] = [];
  if (!c.name.trim()) out.push("name-empty");
  else if (others?.some((o) => o.name.trim().toLowerCase() === c.name.trim().toLowerCase()))
    out.push("name-taken");
  if (sameFolder(c.clipsDir, c.dataDir)) out.push("folders-same");
  if (!/\{nn\}|\{n\}/.test(c.clipIdPattern)) out.push("pattern-no-number");
  return out;
}

export function describeCampaignProblem(p: CampaignProblem): string {
  switch (p) {
    case "name-empty":
      return "Give the campaign a name.";
    case "name-taken":
      return "Another campaign already has that name.";
    case "folders-same":
      return "Clips and Data need different folders.";
    case "pattern-no-number":
      return "The clip id pattern needs {nn} so every clip gets its own number.";
  }
}

export function createCampaign(
  list: readonly Campaign[],
  input: CampaignInput,
  makeId: () => string = newCampaignId,
): { campaigns: Campaign[]; campaign: Campaign } {
  const name = uniqueName(list, input.name.trim());
  const clipsDir = input.clipsDir ?? "";
  const campaign: Campaign = normalizeBand({
    id: uniqueId(list, makeId),
    name,
    targetMinSec: input.targetMinSec ?? DEFAULT_BAND.targetMinSec,
    targetMaxSec: input.targetMaxSec ?? DEFAULT_BAND.targetMaxSec,
    hardMaxSec: input.hardMaxSec ?? DEFAULT_BAND.hardMaxSec,
    clipIdPattern: input.clipIdPattern?.trim() || DEFAULT_PATTERN,
    prefix: (input.prefix ?? "").trim() || defaultPrefix(name),
    format: input.format ?? "mp4",
    quality: input.quality ?? "best",
    clipsDir,
    dataDir: input.dataDir ?? (clipsDir ? defaultDataDir(clipsDir) : ""),
    usedRanges: {},
    // A new campaign starts with the last look used, so a second client is one pick, not a second upload.
    ...((input.fcpLookId ?? lastLookIdUsed(list)) ? { fcpLookId: input.fcpLookId ?? lastLookIdUsed(list) } : {}),
  });
  return { campaigns: [...list, campaign], campaign };
}

/** Patches one campaign. The id and the used ranges are not patchable here. */
export function updateCampaign(
  list: readonly Campaign[],
  id: string,
  patch: Partial<Omit<Campaign, "id" | "usedRanges">>,
): Campaign[] {
  return list.map((c) =>
    c.id === id
      ? normalizeBand({
          ...c,
          ...patch,
          id: c.id,
          usedRanges: c.usedRanges,
          name:
            patch.name !== undefined && patch.name.trim()
              ? uniqueName(list, patch.name.trim(), c.id)
              : c.name,
        })
      : c,
  );
}

export function removeCampaign(list: readonly Campaign[], id: string): Campaign[] {
  return list.filter((c) => c.id !== id);
}

/** The active id to use after the list changed: keep it if it still exists. */
export function resolveActiveId(
  list: readonly Campaign[],
  activeId: string | null,
): string | null {
  if (activeId && list.some((c) => c.id === activeId)) return activeId;
  return list[0]?.id ?? null;
}

// --- Clip ids ----------------------------------------------------------------

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Renders a pattern for a given number. {nn} pads to 2 digits; larger numbers grow. */
export function formatClipId(
  c: Pick<Campaign, "clipIdPattern" | "prefix">,
  videoId: string,
  n: number,
): string {
  return c.clipIdPattern
    .replace(/\{prefix\}/g, c.prefix)
    .replace(/\{videoId\}/g, videoId)
    .replace(/\{nn\}/g, String(n).padStart(2, "0"))
    .replace(/\{n\}/g, String(n));
}

/** The number a clip id carries under this campaign's pattern for a video, or null. */
export function clipNumber(
  c: Pick<Campaign, "clipIdPattern" | "prefix">,
  videoId: string,
  clipId: string,
): number | null {
  const parts = c.clipIdPattern.split(/(\{prefix\}|\{videoId\}|\{nn\}|\{n\})/);
  const re = parts
    .map((p) =>
      p === "{prefix}"
        ? escapeRe(c.prefix)
        : p === "{videoId}"
          ? escapeRe(videoId)
          : p === "{nn}" || p === "{n}"
            ? "(\\d+)"
            : escapeRe(p),
    )
    .join("");
  const m = new RegExp(`^${re}$`).exec(clipId);
  return m ? Number(m[1]) : null;
}

/**
 * The next free clip id for a video: one past the highest number already in use, from the
 * campaign's used ranges plus any other ids the caller knows about (bank, saved clips).
 */
export function nextClipId(
  c: Campaign,
  videoId: string,
  otherIds: readonly string[] = [],
): string {
  const ids = [...(c.usedRanges[videoId] ?? []).map((r) => r.clipId), ...otherIds];
  let max = 0;
  for (const id of ids) {
    const n = clipNumber(c, videoId, id);
    if (n !== null && n > max) max = n;
  }
  return formatClipId(c, videoId, max + 1);
}

// --- Ready-made clip id patterns ----------------------------------------------

/** The sample video code shown in pattern examples. Looks like a real one. */
export const SAMPLE_VIDEO_ID = "9xK2mQ";

export type ClipIdPreset = {
  id: string;
  pattern: string;
  /** Plain words for what the example is made of. */
  parts: string;
  /** Extra plain-language caution shown under the choice, when there is one. */
  note?: string;
};

/**
 * Only tokens formatClipId can expand: {prefix}, {videoId}, {nn}, {n}. There is NO date token,
 * so no date preset exists; add one here only after formatClipId and clipNumber learn it.
 */
export const CLIP_ID_PRESETS: readonly ClipIdPreset[] = [
  { id: "prefix-video-number", pattern: "{prefix}-{videoId}-{nn}", parts: "client code, video, number" },
  {
    id: "prefix-number",
    pattern: "{prefix}-{nn}",
    parts: "client code and number",
    note: "Numbers start again at 01 for every video, so two videos can give the same name.",
  },
  { id: "video-number", pattern: "{videoId}-{nn}", parts: "video and number" },
];

export function presetForPattern(pattern: string): ClipIdPreset | null {
  return CLIP_ID_PRESETS.find((p) => p.pattern === pattern.trim()) ?? null;
}

/** The worked example for a pattern, using the campaign's own prefix and a sample video. */
export function clipIdExample(pattern: string, prefix: string, n = 1): string {
  return formatClipId({ clipIdPattern: pattern, prefix: prefix || "XX" }, SAMPLE_VIDEO_ID, n);
}

// --- Folder defaults -------------------------------------------------------------

/** True when nothing has been chosen yet, so a default should be offered. */
export function needsDefaultFolders(f: { clipsDir: string }): boolean {
  return !f.clipsDir.trim();
}

/**
 * Folders to store on first run. Keeps anything already chosen; never lets the two folders be the
 * same. Returns null when there is nothing to change.
 */
export function applyDefaultFolders<T extends { clipsDir: string; dataDir: string }>(
  current: T,
  offered: { clipsDir?: string; dataDir?: string } | null | undefined,
): T | null {
  if (!offered?.clipsDir || !needsDefaultFolders(current)) return null;
  let dataDir = current.dataDir || offered.dataDir || defaultDataDir(offered.clipsDir);
  if (sameFolder(offered.clipsDir, dataDir)) dataDir = defaultDataDir(offered.clipsDir);
  return { ...current, clipsDir: offered.clipsDir, dataDir };
}

/**
 * With the Data folder hidden nobody can fix a clash with it, so move it beside the clips folder
 * instead of reporting a problem about a setting they cannot see. Visible: left alone.
 */
export function reconcileDataDir(clipsDir: string, dataDir: string, dataVisible: boolean): string {
  return !dataVisible && sameFolder(clipsDir, dataDir) ? defaultDataDir(clipsDir) : dataDir;
}

/** The Data folder only does anything for the channel exporter, so only show it with that. */
export function dataFolderVisible(built: boolean, ownerAccess: boolean): boolean {
  return built && ownerAccess;
}

// --- Used ranges -------------------------------------------------------------

export function usedRangesFor(c: Campaign | null | undefined, videoId: string): UsedRange[] {
  return c?.usedRanges[videoId] ?? [];
}

/** Appends ranges for a clip. Exact duplicates (same clip, same range) are not added twice. */
export function addUsedRanges(
  c: Campaign,
  videoId: string,
  ranges: ReadonlyArray<{ start: number; end: number }>,
  clipId: string,
  at: number = Date.now(),
): Campaign {
  const existing = c.usedRanges[videoId] ?? [];
  const next = [...existing];
  for (const r of ranges) {
    if (!(r.end > r.start)) continue;
    if (next.some((u) => u.clipId === clipId && u.start === r.start && u.end === r.end)) continue;
    next.push({ start: r.start, end: r.end, clipId, at });
  }
  return { ...c, usedRanges: { ...c.usedRanges, [videoId]: next } };
}

/** Clips this campaign made today (local day), counting a joined clip once however many ranges it has. */
export function clipsMadeToday(c: Campaign | null | undefined, now: number = Date.now()): number {
  if (!c) return 0;
  const dayStart = new Date(now).setHours(0, 0, 0, 0);
  const ids = new Set<string>();
  for (const list of Object.values(c.usedRanges)) {
    for (const u of list) if (u.clipId && typeof u.at === "number" && u.at >= dayStart) ids.add(u.clipId);
  }
  return ids.size;
}

/** The top bar's count, "2 of 3 today", or null when the campaign has no daily quota. */
export function todayCount(c: Campaign | null | undefined, now: number = Date.now()): string | null {
  const quota = c?.dailyQuota;
  if (!c || !quota || quota <= 0) return null;
  return `${clipsMadeToday(c, now)} of ${quota} today`;
}

/** Takes a clip's ranges back out, e.g. when the user deletes a cut. */
export function removeUsedRangesFor(c: Campaign, videoId: string, clipId: string): Campaign {
  const existing = c.usedRanges[videoId];
  if (!existing) return c;
  const next = existing.filter((u) => u.clipId !== clipId);
  const usedRanges = { ...c.usedRanges };
  if (next.length) usedRanges[videoId] = next;
  else delete usedRanges[videoId];
  return { ...c, usedRanges };
}

export function countUsedRanges(c: Campaign | null | undefined): number {
  return c ? Object.values(c.usedRanges).reduce((n, r) => n + r.length, 0) : 0;
}

// --- Loading persisted data --------------------------------------------------

function num(v: unknown, fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}

/** Defensive parse of whatever the settings file holds. Bad entries are dropped. */
export function normalizeCampaigns(raw: unknown): Campaign[] {
  if (!Array.isArray(raw)) return [];
  const out: Campaign[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || !r.id || typeof r.name !== "string") continue;
    if (out.some((c) => c.id === r.id)) continue;
    const used: Record<string, UsedRange[]> = {};
    if (r.usedRanges && typeof r.usedRanges === "object") {
      for (const [vid, list] of Object.entries(r.usedRanges as Record<string, unknown>)) {
        if (!Array.isArray(list)) continue;
        const clean = list.flatMap((u) => {
          const x = u as Record<string, unknown>;
          return x && typeof x.start === "number" && typeof x.end === "number"
            ? [
                {
                  start: x.start,
                  end: x.end,
                  clipId: typeof x.clipId === "string" ? x.clipId : "",
                  ...(typeof x.at === "number" && Number.isFinite(x.at) ? { at: x.at } : {}),
                },
              ]
            : [];
        });
        if (clean.length) used[vid] = clean;
      }
    }
    out.push(
      normalizeBand({
        id: r.id,
        name: r.name,
        targetMinSec: num(r.targetMinSec, DEFAULT_BAND.targetMinSec),
        targetMaxSec: num(r.targetMaxSec, DEFAULT_BAND.targetMaxSec),
        hardMaxSec: num(r.hardMaxSec, DEFAULT_BAND.hardMaxSec),
        clipIdPattern: typeof r.clipIdPattern === "string" && r.clipIdPattern ? r.clipIdPattern : DEFAULT_PATTERN,
        prefix: typeof r.prefix === "string" && r.prefix ? r.prefix : defaultPrefix(r.name),
        format: r.format === "mp3" ? "mp3" : "mp4",
        quality: typeof r.quality === "string" ? r.quality : "best",
        clipsDir: typeof r.clipsDir === "string" ? r.clipsDir : "",
        dataDir: typeof r.dataDir === "string" ? r.dataDir : "",
        usedRanges: used,
        ...(typeof r.dailyQuota === "number" && r.dailyQuota > 0 ? { dailyQuota: Math.floor(r.dailyQuota) } : {}),
        ...(typeof r.fcpLookId === "string" && r.fcpLookId ? { fcpLookId: r.fcpLookId } : {}),
      }),
    );
  }
  return out;
}

/** The look the newest campaign that has one is using (for "a new campaign starts with the last look used"). */
export function lastLookIdUsed(list: readonly Campaign[]): string | undefined {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].fcpLookId) return list[i].fcpLookId;
  return undefined;
}
