/**
 * File: bankImport.ts
 * Path: src/renderer/src/shared/utils/bankImport.ts
 * Description: Forgiving parser for pasted clip timestamps (BUILD-SPEC 12b and A1). One clip
 *   per line. Pure: no storage, no React. Lines it cannot read come back with their line
 *   number and a reason; nothing is silently dropped. Categories and tiers are free-form
 *   and never guessed: a field stays empty unless the line, a heading above it, or a
 *   leading T<n>- id says what it is.
 */
import {
  checkRange,
  formatLength,
  parseTimecode,
  totalDuration,
  type Segment,
} from "./segments";

export type ParsedClip = {
  /** 1-based line number in the pasted text. */
  line: number;
  /** The id written on the line, or null (the bank assigns one). */
  id: string | null;
  label: string;
  segments: Segment[];
  category?: string;
  tier?: string;
  note?: string;
};

export type LineError = { line: number; text: string; reason: string };

export type ImportPreview = {
  clips: ParsedClip[];
  errors: LineError[];
  clipCount: number;
  segmentCount: number;
  totalSec: number;
  withCategory: number;
  withoutCategory: number;
  withTier: number;
  /** Distinct values seen in this paste, first spelling kept, in order of appearance. */
  categories: string[];
  tiers: string[];
};

export type ParseOptions = {
  /** Source video length in seconds. A range ending after it is reported. */
  duration?: number;
};

const TIME = String.raw`\d+(?::\d{1,2}){0,2}(?:\.\d+)?`;
const SEP = String.raw`(?:-->|->|→|–|—|-|to)`;
const RANGE_SRC = `(${TIME})\\s*${SEP}\\s*(${TIME})`;
/** A range must start at a token edge, so `05-07` inside an id is not read as 5s to 7s. */
const RANGE_FIRST = new RegExp(String.raw`(?<![\w\-.:→–—])${RANGE_SRC}`);
const RANGE_NEXT = new RegExp(String.raw`^\s*[;+]\s*${RANGE_SRC}`);
const EXPLICIT = /(?<![A-Za-z0-9_])(category|cat|tier|t)\s*:\s*(?:"([^"]*)"|'([^']*)'|([^\s|;[\]]+))/gi;
const COLON_TIME = /\d{1,2}:\d{2}/;

function stamp(sec: number): string {
  // formatLength is M:SS or H:MM:SS, which is how people write timestamps.
  return formatLength(sec);
}

/** `T2` and `tier 2` read as `2`; anything else is kept as written. */
export function normalizeTier(raw: string): string {
  const v = raw.trim();
  const m = /^t(?:ier)?\s*(\d+)$/i.exec(v);
  return m ? m[1] : v;
}

function tierLike(field: string): string | null {
  const v = field.trim();
  if (/^\d+$/.test(v)) return v;
  const m = /^(?:t|tier)\s*[:=]?\s*(\S+)$/i.exec(v);
  if (m && /^\d+$/.test(m[1])) return m[1];
  return null;
}

function headingText(s: string): string | null {
  if (RANGE_FIRST.test(s) || COLON_TIME.test(s)) return null;
  const m = /^[#*_\s]*(.*?)\s*:\s*$/.exec(s);
  if (!m) return null;
  const text = m[1].replace(/^\[|\]$/g, "").replace(/[#*_]+$/g, "").trim();
  return text;
}

type Fail = { reason: string };

function parseClipLine(
  original: string,
  heading: string | undefined,
  duration: number | undefined,
): { ok: true; clip: Omit<ParsedClip, "line"> } | ({ ok: false } & Fail) {
  let s = original.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, "");

  // 1. explicit key: value anywhere
  let explicitCat: string | undefined;
  let explicitTier: string | undefined;
  s = s.replace(EXPLICIT, (_m, key: string, dq?: string, sq?: string, bare?: string) => {
    const value = (dq ?? sq ?? bare ?? "").trim();
    if (value) {
      if (/^t(ier)?$/i.test(key)) explicitTier ??= normalizeTier(value);
      else explicitCat ??= value;
    }
    return " ";
  });

  // 2. bracketed and piped fields
  const fields: string[] = [];
  s = s.replace(/\[([^\]]*)\]/g, (_m, inner: string) => {
    fields.push(inner);
    return " ";
  });
  if (s.includes("|")) {
    const parts = s.split("|");
    s = parts[0];
    fields.push(...parts.slice(1));
  }
  let fieldCat: string | undefined;
  let fieldTier: string | undefined;
  const extras: string[] = [];
  for (const f of fields) {
    const v = f.trim();
    if (!v) continue;
    const t = tierLike(v);
    if (t !== null && fieldTier === undefined) fieldTier = t;
    else if (t === null && fieldCat === undefined) fieldCat = v;
    else extras.push(v);
  }

  // 3. the time ranges
  const first = RANGE_FIRST.exec(s);
  if (!first) {
    if (COLON_TIME.test(s)) {
      return { ok: false, reason: "Found a time but no range. Write a start and an end, like 38:43 - 39:26" };
    }
    return {
      ok: false,
      reason: "No time range found, and it is not a heading (a heading ends with a colon)",
    };
  }
  const pairs: Array<[string, string]> = [[first[1], first[2]]];
  const prefix = s.slice(0, first.index).trim();
  let tail = s.slice(first.index + first[0].length);
  for (;;) {
    const next = RANGE_NEXT.exec(tail);
    if (!next) break;
    pairs.push([next[1], next[2]]);
    tail = tail.slice(next[0].length);
  }
  if (/^\s*[;+]/.test(tail)) {
    return {
      ok: false,
      reason: `Segment ${pairs.length + 1} is not a range. After ; or + write a start and an end`,
    };
  }

  const segments: Segment[] = [];
  for (let i = 0; i < pairs.length; i++) {
    const [a, b] = pairs[i];
    const start = parseTimecode(a);
    const end = parseTimecode(b);
    const n = pairs.length > 1 ? `Segment ${i + 1}: ` : "";
    if (start === null) return { ok: false, reason: `${n}${a} is not a valid time` };
    if (end === null) return { ok: false, reason: `${n}${b} is not a valid time` };
    const check = checkRange({ start, end }, duration);
    if (!check.ok) {
      const why =
        check.reason === "end-before-start"
          ? `the end (${b}) is before the start (${a})`
          : check.reason === "empty"
            ? `the start and end are the same (${a})`
            : check.reason === "past-duration"
              ? `it ends at ${stamp(end)}, past the end of the video (${stamp(duration ?? 0)})`
              : "that range is not valid";
      return { ok: false, reason: `${n}${why}` };
    }
    segments.push({ start, end });
  }

  // 4. leading id, then label
  let id: string | null = null;
  let labelHead = "";
  if (prefix) {
    const tokens = prefix.split(/\s+/);
    const cand = tokens[0].replace(/[:).,]+$/, "");
    if (/^[A-Za-z0-9][\w.\-]*$/.test(cand) && /[\d-]/.test(cand)) {
      id = cand;
      labelHead = tokens.slice(1).join(" ");
    } else {
      labelHead = prefix;
    }
  }
  const labelTail = tail
    .replace(/^[\s\-–—:,.)]+/, "")
    .replace(/^["“](.*)["”]$/, "$1")
    .trim();
  const label = [labelHead, labelTail].filter(Boolean).join(" ").trim();

  const idTier = id ? /^T(\d+)-/.exec(id)?.[1] : undefined;
  const category = explicitCat ?? fieldCat ?? heading;
  const tier = explicitTier ?? fieldTier ?? idTier;

  const clip: Omit<ParsedClip, "line"> = { id, label, segments };
  if (category) clip.category = category;
  if (tier) clip.tier = tier;
  if (extras.length) clip.note = extras.join(" | ");
  return { ok: true, clip };
}

/** Parse the whole paste. Never throws; every non-blank line ends up in `clips`, in a heading, or in `errors`. */
export function parseBankImport(text: string, opts: ParseOptions = {}): ImportPreview {
  const clips: ParsedClip[] = [];
  const errors: LineError[] = [];
  const seenIds = new Map<string, number>();
  let heading: string | undefined;

  const lines = String(text ?? "").replace(/^﻿/, "").split(/\r\n|\r|\n/);
  lines.forEach((raw, i) => {
    const line = i + 1;
    const s = raw.trim();
    if (!s) return;

    const h = headingText(s);
    if (h !== null) {
      if (h) heading = h;
      else errors.push({ line, text: s, reason: "A heading needs a name before the colon" });
      return;
    }

    const res = parseClipLine(s, heading, opts.duration);
    if (!res.ok) {
      errors.push({ line, text: s, reason: res.reason });
      return;
    }
    const id = res.clip.id;
    if (id) {
      const key = id.toLowerCase();
      const prior = seenIds.get(key);
      if (prior !== undefined) {
        errors.push({ line, text: s, reason: `The id ${id} is already used on line ${prior}` });
        return;
      }
      seenIds.set(key, line);
    }
    clips.push({ line, ...res.clip });
  });

  const dedupe = (values: Array<string | undefined>) => {
    const seen = new Map<string, string>();
    for (const v of values) if (v && !seen.has(v.toLowerCase())) seen.set(v.toLowerCase(), v);
    return [...seen.values()];
  };
  const withCategory = clips.filter((c) => c.category).length;
  return {
    clips,
    errors,
    clipCount: clips.length,
    segmentCount: clips.reduce((n, c) => n + c.segments.length, 0),
    totalSec: clips.reduce((n, c) => n + totalDuration(c.segments), 0),
    withCategory,
    withoutCategory: clips.length - withCategory,
    withTier: clips.filter((c) => c.tier).length,
    categories: dedupe(clips.map((c) => c.category)),
    tiers: dedupe(clips.map((c) => c.tier)),
  };
}
