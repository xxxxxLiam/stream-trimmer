/**
 * File: clipNames.ts
 * Path: src/main/features/engine/services/clipNames/clipNames.ts
 * Description: Suggests clip names offline from what is said inside a range: no account, no network,
 *   no model. The phrase table is built once per transcript (30-second windows, TF-IDF), then each
 *   suggestion is a cheap lookup. Two words at most; "2", "3" repeat suffixes don't count.
 */
import { STOPWORDS } from "./stopwords";

export interface NameLine {
  start: number;
  end: number;
  text: string;
}
export interface NameRange {
  start: number;
  end: number;
}
export interface NameTable {
  /** Number of 30 s windows in the transcript. */
  windows: number;
  /** Phrase -> number of windows it appears in. */
  df: Map<string, number>;
}

export const WINDOW_SECONDS = 30;
const RESERVED = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Content words in order: contractions, stopwords, numbers and one/two-letter tokens removed. */
export function contentWords(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().split(/\s+/)) {
    const w = raw.replace(/^[^\p{L}\p{N}']+|[^\p{L}\p{N}']+$/gu, "");
    if (!w || /['’]/.test(w)) continue; // contractions and possessives
    const letters = w.replace(/[^\p{L}]/gu, "");
    if (letters.length < 3 || letters.length !== w.length) continue;
    if (STOPWORDS.has(w)) continue;
    out.push(w);
  }
  return out;
}

function phrasesOf(words: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i + 1 < words.length; i++) {
    if (words[i] !== words[i + 1]) out.push(`${words[i]} ${words[i + 1]}`);
  }
  return out;
}

/** Build once when a transcript loads; reuse for every clip of that video. */
export function buildNameTable(lines: readonly NameLine[]): NameTable {
  const byWindow = new Map<number, string[]>();
  for (const l of lines) {
    const win = Math.floor(l.start / WINDOW_SECONDS);
    const arr = byWindow.get(win) ?? [];
    arr.push(...contentWords(l.text));
    byWindow.set(win, arr);
  }
  const df = new Map<string, number>();
  for (const words of byWindow.values()) {
    for (const p of new Set([...phrasesOf(words), ...words])) df.set(p, (df.get(p) ?? 0) + 1);
  }
  return { windows: byWindow.size, df };
}

function titleCase(s: string): string {
  return s.replace(/\p{L}[\p{L}\p{N}]*/gu, (w) => w[0].toUpperCase() + w.slice(1));
}

/** Safe as a file name on Mac and Windows. */
export function safeFileName(name: string): string {
  let n = name
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");
  if (RESERVED.test(n)) n = `${n} clip`;
  return n.slice(0, 80).trim();
}

/** Ranked candidate names for one clip (joined clips pass every range). Best first. */
export function rankedNames(
  table: NameTable,
  lines: readonly NameLine[],
  ranges: readonly NameRange[],
): string[] {
  const inRange = lines.filter((l) => ranges.some((r) => l.start < r.end && l.end > r.start));
  const words = contentWords(inRange.map((l) => l.text).join(" "));
  const tf = new Map<string, number>();
  const order = new Map<string, number>();
  for (const p of [...phrasesOf(words), ...words]) {
    tf.set(p, (tf.get(p) ?? 0) + 1);
    if (!order.has(p)) order.set(p, order.size);
  }
  const score = (p: string) => {
    const idf = Math.log(1 + (table.windows || 1) / (table.df.get(p) ?? 1));
    return (tf.get(p) ?? 0) * idf;
  };
  const phrases = [...tf.keys()].filter((p) => p.includes(" "));
  const singles = [...tf.keys()].filter((p) => !p.includes(" "));
  const byScore = (a: string, b: string) => score(b) - score(a) || order.get(a)! - order.get(b)!;
  // Two-word phrases first; one distinctive word only when no phrase exists.
  return [...phrases.sort(byScore), ...singles.sort(byScore)].map(titleCase);
}

function nextFree(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base.toLowerCase())) return base;
  for (let n = 2; ; n++) if (!taken.has(`${base} ${n}`.toLowerCase())) return `${base} ${n}`;
}

/**
 * The suggestion for a clip. `skip` walks down the list (the refresh button). With no usable words,
 * falls back to "<video title> 1", "2" ... `existing` are names already used, so repeats get a quiet number.
 */
export function suggestClipName(opts: {
  table: NameTable | null;
  lines: readonly NameLine[];
  ranges: readonly NameRange[];
  videoTitle: string;
  existing?: readonly string[];
  skip?: number;
}): string {
  const taken = new Set((opts.existing ?? []).map((s) => s.toLowerCase()));
  const ranked = opts.table ? rankedNames(opts.table, opts.lines, opts.ranges) : [];
  if (ranked.length > 0) {
    const pick = ranked[(opts.skip ?? 0) % ranked.length];
    const safe = safeFileName(pick);
    if (safe) return nextFree(safe, taken);
  }
  const title = safeFileName(opts.videoTitle) || "Clip";
  for (let n = 1; ; n++) if (!taken.has(`${title} ${n}`.toLowerCase())) return `${title} ${n}`;
}
