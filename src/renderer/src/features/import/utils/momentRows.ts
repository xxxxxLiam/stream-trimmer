/**
 * File: momentRows.ts
 * Path: src/renderer/src/features/import/utils/momentRows.ts
 * Description: Reads rows pasted from a sheet (the columns an outside AI fills in: video link, start,
 *   end, name, rating, topic, tier, campaign) into moments grouped by video. Rows it cannot trust are
 *   flagged with a reason and one suggested action, Swap times or Skip, and never dropped silently.
 *   Rows with no video link belong to the video that is open. Pure; no storage, no React.
 */
import { extractVideoId } from "../../../shared/utils/clip";
import { normalizeTier, parseBankImport } from "../../../shared/utils/bankImport";
import { parseTimecode } from "../../../shared/utils/segments";
import { checkNames } from "../../clips/utils/clipName";

export type RowProblem = {
  reason: string;
  fix: "swap" | "skip";
  /** The name is what is wrong, so the row can be renamed. */
  name?: true;
  /** In and out are both within 2 s of another moment: Skip or Keep (board 04.2.2). */
  duplicate?: true;
};

export type MomentRow = {
  /** Stable within one paste: the 1-based line. */
  key: string;
  videoId: string | null;
  link: string;
  name: string;
  start: number;
  end: number;
  /** More sections of the same clip (same video, same name), in row order; the first section is start/end. */
  more?: { start: number; end: number }[];
  rating?: number;
  category?: string;
  tier?: string;
  campaign?: string;
  /** The out point was past the end of the video and was moved to it (seconds). */
  ranPastEnd?: number;
  /** A duplicate the person chose to keep: the bank card says to adjust it in the timeline. */
  keptDuplicate?: true;
  problem?: RowProblem;
};

export type ParseContext = {
  /** The video that is open; link-less rows belong to it. */
  openVideoId: string | null;
  openDuration?: number;
};

/** What "Copy format" hands to the user's AI. */
export const COPY_FORMAT = [
  "Reply with a table I can paste into a sheet, one moment per row, tab-separated, with this header row:",
  "video\tstart\tend\tname\trating\ttopic\ttier\tcampaign",
  "video: the YouTube link. start and end: times like 1:12:04. name: two words. rating: 0 to 10.",
  "topic, tier and campaign are optional; leave them empty if you have nothing to say.",
].join("\n");

const COLUMNS: Record<string, string> = {
  video: "video", link: "video", url: "video", source: "video",
  start: "start", from: "start", in: "start",
  end: "end", to: "end", out: "end",
  name: "name", title: "name", label: "name",
  rating: "rating", score: "rating",
  topic: "category", category: "category", lane: "category",
  tier: "tier",
  campaign: "campaign", client: "campaign",
};
const HINT_ORDER = ["name", "start", "end", "rating", "category", "tier", "campaign"];
const ORDER = ["video", "start", "end", "name", "rating", "category", "tier", "campaign"];

function splitCells(line: string): string[] {
  if (line.includes("\t")) return line.split("\t").map((c) => c.trim());
  const out: string[] = [];
  let cur = "";
  let quoted = false;
  for (const ch of line) {
    if (ch === '"') quoted = !quoted;
    else if (ch === "," && !quoted) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function headerMap(cells: string[]): Record<string, number> | null {
  const map: Record<string, number> = {};
  cells.forEach((c, i) => {
    const key = COLUMNS[c.toLowerCase().replace(/[^a-z]/g, "")];
    if (key && !(key in map)) map[key] = i;
  });
  return Object.keys(map).length >= 2 && ("start" in map || "video" in map) ? map : null;
}

function num(raw: string | undefined): number | undefined {
  const n = Number((raw ?? "").trim());
  return Number.isFinite(n) && (raw ?? "").trim() !== "" ? n : undefined;
}

function rowFromCells(get: (k: string) => string, line: number, ctx: ParseContext): MomentRow {
  const link = get("video");
  const id = link ? extractVideoId(link) : ctx.openVideoId;
  const start = parseTimecode(get("start"));
  const end = parseTimecode(get("end"));
  const name = get("name").replace(/^["“]|["”]$/g, "").trim();
  const rating = num(get("rating"));
  const row: MomentRow = {
    key: String(line),
    videoId: id ?? null,
    link,
    name,
    start: start ?? 0,
    end: end ?? 0,
  };
  if (rating !== undefined) row.rating = Math.min(10, Math.max(0, rating));
  if (get("category")) row.category = get("category");
  if (get("tier")) row.tier = normalizeTier(get("tier"));
  if (get("campaign")) row.campaign = get("campaign");

  if (link && !id) row.problem = { reason: "link cut off", fix: "skip" };
  else if (!id) row.problem = { reason: "no video link", fix: "skip" };
  else if (start === null || end === null) row.problem = { reason: "times not readable", fix: "skip" };
  else if (end < start) row.problem = { reason: "end before start", fix: "swap" };
  else if (end === start) row.problem = { reason: "no length", fix: "skip" };
  else if (id === ctx.openVideoId && ctx.openDuration && start >= ctx.openDuration) row.problem = { reason: "This part isn’t in the video", fix: "skip" };
  else if (id === ctx.openVideoId && ctx.openDuration && end > ctx.openDuration) {
    row.end = ctx.openDuration;
    row.ranPastEnd = ctx.openDuration;
  }
  return row;
}

export function parseMoments(text: string, ctx: ParseContext): MomentRow[] {
  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const rows: MomentRow[] = [];
  let map: Record<string, number> | null = null;
  const tabbed = lines.some((l) => l.includes("\t"));

  lines.forEach((raw, i) => {
    const s = raw.trim();
    if (!s) return;
    const cells = splitCells(s);
    const header = headerMap(cells);
    if (header && !rows.length) {
      map = header;
      return;
    }
    const line = i + 1;
    if (map) {
      rows.push(rowFromCells((k) => (k in map! ? (cells[map![k]] ?? "") : ""), line, ctx));
    } else if (cells.length >= 3 && !extractVideoId(cells[0]) && parseTimecode(cells[1]) !== null && parseTimecode(cells[2]) !== null) {
      // The hint's own order, no header and no link: "Honest Version, 1:12:04, 1:12:46" (comma or tab) for the open video.
      rows.push(rowFromCells((k) => cells[HINT_ORDER.indexOf(k)] ?? "", line, ctx));
    } else if (tabbed && cells.length >= 3) {
      // A sheet paste without its header row: the order "Copy format" asks for.
      rows.push(rowFromCells((k) => cells[ORDER.indexOf(k)] ?? "", line, ctx));
    } else {
      // Plain lines for the open video ("1:12:04-1:12:46 Honest Version"): the existing reader.
      const p = parseBankImport(s, { duration: ctx.openDuration });
      for (const c of p.clips) {
        const seg = c.segments[0];
        rows.push({
          key: String(line),
          videoId: ctx.openVideoId,
          link: "",
          name: c.label,
          start: seg.start,
          end: seg.end,
          ...(c.segments.length > 1 ? { more: c.segments.slice(1).map((x) => ({ start: x.start, end: x.end })) } : {}),
          ...(c.ranPastEnd !== undefined ? { ranPastEnd: c.ranPastEnd } : {}),
          ...(c.category ? { category: c.category } : {}),
          ...(c.tier ? { tier: c.tier } : {}),
          ...(ctx.openVideoId ? {} : { problem: { reason: "no video link", fix: "skip" as const } }),
        });
      }
      for (const e of p.errors) rows.push({ key: String(line), videoId: null, link: "", name: s.slice(0, 40), start: 0, end: 0, problem: { reason: e.reason.toLowerCase().replace(/\.$/, ""), fix: "skip" } });
    }
  });
  return rows;
}

export type Resolved = {
  good: MomentRow[];
  flagged: MomentRow[];
  /** Good rows grouped by video, in order of first appearance. */
  groups: { videoId: string; rows: MomentRow[] }[];
  /** Campaign names the paste mentions, in order. */
  campaigns: string[];
};

/** Applies the person's choices: swapped rows become good, skipped rows vanish. */
export function resolveRows(rows: readonly MomentRow[], swapped: ReadonlySet<string>, skipped: ReadonlySet<string>): Resolved {
  const good: MomentRow[] = [];
  const flagged: MomentRow[] = [];
  for (const r of rows) {
    if (skipped.has(r.key)) continue;
    if (!r.problem) good.push(r);
    else if (r.problem.fix === "swap" && swapped.has(r.key)) good.push({ ...r, start: r.end, end: r.start, problem: undefined });
    else flagged.push(r);
  }
  const groups: Resolved["groups"] = [];
  for (const r of good) {
    const g = groups.find((x) => x.videoId === r.videoId);
    if (g) g.rows.push(r);
    else groups.push({ videoId: r.videoId as string, rows: [r] });
  }
  const campaigns = [...new Set(good.map((r) => r.campaign).filter((c): c is string => !!c))];
  return { good, flagged, groups, campaigns };
}

export type BankBucket = { campaignName: string | null; videoId: string; rows: MomentRow[] };

/** Which rows go to which campaign and video. A row naming no campaign goes to the active one (null name). */
export function planBank(good: readonly MomentRow[]): BankBucket[] {
  const out: BankBucket[] = [];
  for (const r of good) {
    if (!r.videoId) continue;
    const name = r.campaign ? r.campaign.trim() : null;
    const key = (n: string | null) => (n ? n.toLowerCase() : null);
    const b = out.find((x) => key(x.campaignName) === key(name) && x.videoId === r.videoId);
    if (b) b.rows.push(r);
    else out.push({ campaignName: name, videoId: r.videoId, rows: [r] });
  }
  return out;
}

/**
 * Run the clip-name rule on a paste: a row whose name is not two plain words, repeats another row's
 * name, or is already in the bank is flagged "Skip" with the reason, so import never files a name the
 * rule forbids. A row with no name is fine (it is named from its words when it is made).
 */
export function flagNames(rows: readonly MomentRow[], existing: ReadonlyArray<{ id: string; name: string }> = []): MomentRow[] {
  const named = rows.filter((r) => !r.problem && r.name.trim());
  const problems = new Map(
    checkNames(
      named.map((r) => ({ line: Number(r.key), id: null, label: r.name })),
      existing,
    ).map((p) => [String(p.line), p.reason]),
  );
  return rows.map((r) => (problems.has(r.key) ? { ...r, problem: { reason: problems.get(r.key)!, fix: "skip" as const, name: true as const } } : r));
}

/**
 * The name check as the person works through the list: a rename takes effect, and a skipped row no
 * longer counts as the other holder of a name, so its twin is not left flagged against a line that
 * will never be banked. A skipped row keeps its own flag (it is skipped either way).
 */
/**
 * Rows on the same video with the same name (any case) are the sections of ONE clip, in row order. The
 * first row speaks for it (rating, topic, tier, campaign); the later rows fold into it and leave the
 * list. Flagged and skipped rows never merge, and the same name on a different video stays two rows
 * (the name check then flags it).
 */
export function mergeSections(rows: readonly MomentRow[], skipped: ReadonlySet<string> = new Set()): MomentRow[] {
  const out: MomentRow[] = [];
  const first = new Map<string, number>();
  for (const r of rows) {
    const name = r.name.trim().toLowerCase();
    if (r.problem || skipped.has(r.key) || !name || !r.videoId) {
      out.push(r);
      continue;
    }
    const k = `${r.videoId}\u0000${name}`;
    const at = first.get(k);
    if (at === undefined) {
      first.set(k, out.length);
      out.push(r);
    } else {
      const head = out[at];
      out[at] = { ...head, more: [...(head.more ?? []), { start: r.start, end: r.end }, ...(r.more ?? [])] };
    }
  }
  return out;
}

/** Two moments are the same one when their in and their out are each within this many seconds. */
export const DUPLICATE_SECONDS = 2;

/** Rows on the same video that repeat an earlier row or an existing bank card are flagged "duplicate"; a kept one is marked instead. */
export function flagDuplicates(
  rows: readonly MomentRow[],
  existing: ReadonlyArray<{ videoId: string; start: number; end: number; name?: string }>,
  kept: ReadonlySet<string>,
): MomentRow[] {
  const near = (a: { start: number; end: number }, b: { start: number; end: number }) =>
    Math.abs(a.start - b.start) <= DUPLICATE_SECONDS && Math.abs(a.end - b.end) <= DUPLICATE_SECONDS;
  const seen: { videoId: string; start: number; end: number; name?: string; paste?: true }[] = [...existing];
  return rows.map((r) => {
    if (r.problem || !r.videoId) return r;
    const hit = seen.find((o) => o.videoId === r.videoId && near(o, r));
    seen.push({ videoId: r.videoId, start: r.start, end: r.end, name: r.name, paste: true });
    if (!hit) return r;
    if (kept.has(r.key)) return { ...r, keptDuplicate: true as const };
    const gap = Math.round(Math.max(Math.abs(hit.start - r.start), Math.abs(hit.end - r.end)));
    const where = hit.paste ? "in this paste" : "in Export";
    const reason = gap === 0 ? `Same range as one ${where}` : `${gap} s from ${hit.name?.trim() || "another moment"} ${where}`;
    return { ...r, problem: { reason, fix: "skip" as const, duplicate: true as const } };
  });
}

export function checkImportNames(
  parsed: readonly MomentRow[],
  existing: ReadonlyArray<{ id: string; name: string }>,
  skipped: ReadonlySet<string>,
  renamed: ReadonlyMap<string, string>,
  existingRanges: ReadonlyArray<{ videoId: string; start: number; end: number; name?: string }> = [],
  kept: ReadonlySet<string> = new Set(),
): MomentRow[] {
  const applied = mergeSections(parsed.map((r) => (renamed.has(r.key) ? { ...r, name: renamed.get(r.key)! } : r)), skipped);
  const checked = new Map(flagNames(applied.filter((r) => !skipped.has(r.key)), existing).map((r) => [r.key, r]));
  const named = applied.map((r) => checked.get(r.key) ?? r);
  // A skipped row is not a twin of anything, so it neither flags nor is flagged.
  const live = flagDuplicates(named.filter((r) => !skipped.has(r.key)), existingRanges, kept);
  const dup = new Map(live.map((r) => [r.key, r]));
  return named.map((r) => dup.get(r.key) ?? r);
}
