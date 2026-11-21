/**
 * File: campaigns.ts
 * Path: src/lib/campaigns.ts
 * Description: Campaign model and pure operations (BUILD-SPEC section 5). No preset
 *   campaigns ship: the app starts empty. Everything here is pure and returns new
 *   values, so the context only has to store the result.
 */

/** A source-video range already used by a published clip. Seconds. */
export type UsedRange = { start: number; end: number; clipId: string };

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

function slug(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "") || "campaign"
  );
}

function uniqueId(list: readonly Campaign[], name: string): string {
  const base = slug(name);
  const taken = new Set(list.map((c) => c.id));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
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

/** "/a/b/clips" -> "/a/b/channel-data". Keeps the separator style of the input. */
export function defaultDataDir(clipsDir: string): string {
  const trimmed = clipsDir.replace(/[\\/]+$/, "");
  const sep = trimmed.includes("\\") && !trimmed.includes("/") ? "\\" : "/";
  const cut = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (cut < 0) return "channel-data";
  const parent = trimmed.slice(0, cut);
  return `${parent === "" ? "" : parent}${sep}channel-data`;
}

function normFolder(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
}

export function sameFolder(a: string, b: string): boolean {
  return a !== "" && b !== "" && normFolder(a) === normFolder(b);
}

export type CampaignProblem = "name-empty" | "folders-same" | "pattern-no-number";

export function validateCampaign(c: Pick<Campaign, "name" | "clipsDir" | "dataDir" | "clipIdPattern">): CampaignProblem[] {
  const out: CampaignProblem[] = [];
  if (!c.name.trim()) out.push("name-empty");
  if (sameFolder(c.clipsDir, c.dataDir)) out.push("folders-same");
  if (!/\{nn\}|\{n\}/.test(c.clipIdPattern)) out.push("pattern-no-number");
  return out;
}

export function describeCampaignProblem(p: CampaignProblem): string {
  switch (p) {
    case "name-empty":
      return "Give the campaign a name.";
    case "folders-same":
      return "Clips and Data need different folders.";
    case "pattern-no-number":
      return "The clip id pattern needs {nn} so every clip gets its own number.";
  }
}

export function createCampaign(
  list: readonly Campaign[],
  input: CampaignInput,
): { campaigns: Campaign[]; campaign: Campaign } {
  const name = input.name.trim();
  const clipsDir = input.clipsDir ?? "";
  const campaign: Campaign = normalizeBand({
    id: uniqueId(list, name),
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
          name: (patch.name ?? c.name).trim() || c.name,
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
): Campaign {
  const existing = c.usedRanges[videoId] ?? [];
  const next = [...existing];
  for (const r of ranges) {
    if (!(r.end > r.start)) continue;
    if (next.some((u) => u.clipId === clipId && u.start === r.start && u.end === r.end)) continue;
    next.push({ start: r.start, end: r.end, clipId });
  }
  return { ...c, usedRanges: { ...c.usedRanges, [videoId]: next } };
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
            ? [{ start: x.start, end: x.end, clipId: typeof x.clipId === "string" ? x.clipId : "" }]
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
      }),
    );
  }
  return out;
}
