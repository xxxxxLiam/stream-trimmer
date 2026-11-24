/**
 * File: clipNameSession.ts
 * Path: src/main/features/engine/services/clipNames/clipNameSession.ts
 * Description: Holds the phrase table for the open video so a name suggestion is a cheap lookup. The
 *   table is built once when a transcript loads (`prepareNames`) and reused for every clip
 *   (`suggestName`). Only the few most recent videos are kept. Validates its input: it comes from the
 *   renderer over IPC.
 */
import { buildNameTable, suggestClipName, type NameLine, type NameRange, type NameTable } from "./clipNames";

const MAX_VIDEOS = 4;
const MAX_LINES = 100_000;
const MAX_RANGES = 50;

const cache = new Map<string, { table: NameTable; lines: NameLine[] }>();

const isNum = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);

function cleanLines(raw: unknown): NameLine[] | null {
  if (!Array.isArray(raw) || raw.length > MAX_LINES) return null;
  const out: NameLine[] = [];
  for (const l of raw) {
    if (!l || !isNum(l.start) || !isNum(l.end) || typeof l.text !== "string") return null;
    out.push({ start: l.start, end: l.end, text: l.text });
  }
  return out;
}

export function prepareNames(videoId: unknown, rawLines: unknown): { ok: boolean; error?: string } {
  if (typeof videoId !== "string" || !videoId) return { ok: false, error: "No video id." };
  const lines = cleanLines(rawLines);
  if (!lines) return { ok: false, error: "The transcript lines are not valid." };
  cache.delete(videoId);
  cache.set(videoId, { table: buildNameTable(lines), lines });
  while (cache.size > MAX_VIDEOS) cache.delete(cache.keys().next().value as string);
  return { ok: true };
}

export function suggestName(p: {
  videoId?: unknown;
  ranges?: unknown;
  videoTitle?: unknown;
  existing?: unknown;
  skip?: unknown;
}): { ok: boolean; name?: string; error?: string } {
  const ranges = Array.isArray(p.ranges) ? p.ranges : null;
  if (!ranges || ranges.length === 0 || ranges.length > MAX_RANGES || !ranges.every((r) => r && isNum(r.start) && isNum(r.end))) {
    return { ok: false, error: "Needs at least one range." };
  }
  const existing = Array.isArray(p.existing) ? p.existing.filter((s): s is string => typeof s === "string").slice(0, 1000) : [];
  const entry = typeof p.videoId === "string" ? cache.get(p.videoId) : undefined;
  const name = suggestClipName({
    table: entry?.table ?? null,
    lines: entry?.lines ?? [],
    ranges: ranges as NameRange[],
    videoTitle: typeof p.videoTitle === "string" ? p.videoTitle : "",
    existing,
    skip: isNum(p.skip) && p.skip >= 0 ? Math.floor(p.skip) : 0,
  });
  return { ok: true, name };
}

/** For tests. */
export function clearNameSessions(): void {
  cache.clear();
}
