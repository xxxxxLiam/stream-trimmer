/**
 * File: vtt.ts
 * Path: src/main/features/engine/utils/vtt.ts
 * Description: Parses a WebVTT transcript into timed lines. YouTube's rolling auto-captions repeat
 *   every line (once as the "new" line carrying per-word times, again as the old line of the next
 *   cue, plus 10 ms filler cues). Those repeats are merged into one clean line per sentence and the
 *   per-word times are kept. Hand-made captions carry no word times, so their lines have no `words`
 *   and the transcript reports `wordTimings: false`; word snapping stays off for that video.
 */

export interface VttWord {
  start: number;
  end: number;
  text: string;
}

export interface VttLine {
  start: number;
  end: number;
  text: string;
  /** Present only when the source gave per-word times. */
  words?: VttWord[];
}

export interface VttTranscript {
  lines: VttLine[];
  /** True when every line carries word times (rolling auto-captions). */
  wordTimings: boolean;
}

const CUE_TIMING =
  /(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})/;
const WORD_TAG = /<(?:(\d{1,2}):)?(\d{2}):(\d{2})\.(\d{3})>/;

const toSec = (h: string | undefined, m: string, s: string, ms: string) =>
  (h ? +h * 3600 : 0) + +m * 60 + +s + +ms / 1000;

const stripTags = (s: string) => s.replace(/<[^>]+>/g, "");
const clean = (s: string) =>
  stripTags(s)
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();

/** Words of one row that carries inline `<00:00:01.500>` stamps. The first word starts at `cueStart`. */
function parseTimedRow(row: string, cueStart: number, cueEnd: number): VttWord[] {
  const parts = row.split(new RegExp(WORD_TAG.source, "g"));
  // split with 4 capture groups: [text, h, m, s, ms, text, h, m, s, ms, text ...]
  const chunks: { at: number; text: string }[] = [{ at: cueStart, text: parts[0] }];
  for (let i = 1; i + 4 < parts.length; i += 5) {
    chunks.push({ at: toSec(parts[i], parts[i + 1], parts[i + 2], parts[i + 3]), text: parts[i + 4] });
  }
  const words: VttWord[] = [];
  for (const c of chunks) {
    for (const w of clean(c.text).split(" ").filter(Boolean)) {
      words.push({ start: c.at, end: c.at, text: w });
    }
  }
  for (let i = 0; i < words.length; i++) {
    const next = i + 1 < words.length ? words[i + 1].start : cueEnd;
    words[i].end = Math.max(words[i].start, next);
  }
  return words;
}

export function parseVttTranscript(raw: string): VttTranscript {
  const blocks = raw.replace(/\r/g, "").split(/\n{2,}/);
  const cues: { start: number; end: number; rows: string[] }[] = [];
  for (const block of blocks) {
    const rows = block.split("\n");
    const ti = rows.findIndex((r) => CUE_TIMING.test(r));
    if (ti < 0) continue;
    const m = rows[ti].match(CUE_TIMING)!;
    cues.push({
      start: toSec(m[1], m[2], m[3], m[4]),
      end: toSec(m[5], m[6], m[7], m[8]),
      rows: rows.slice(ti + 1).filter((r) => r.trim()),
    });
  }

  const rolling = cues.some((c) => c.rows.some((r) => WORD_TAG.test(r)));
  const lines: VttLine[] = [];

  if (rolling) {
    // Only the row with word stamps is new; untagged rows are repeats of the previous line.
    for (const cue of cues) {
      for (const row of cue.rows) {
        if (!WORD_TAG.test(row)) continue;
        const words = parseTimedRow(row, cue.start, cue.end);
        if (words.length === 0) continue;
        lines.push({
          start: words[0].start,
          end: words[words.length - 1].end,
          text: words.map((w) => w.text).join(" "),
          words,
        });
      }
    }
    // A line ends where the next one starts, so repeats never overlap.
    for (let i = 0; i + 1 < lines.length; i++) {
      const next = lines[i + 1].start;
      if (lines[i].end > next && next >= lines[i].start) {
        lines[i].end = next;
        const ws = lines[i].words!;
        for (const w of ws) {
          if (w.end > next) w.end = Math.max(w.start, next);
        }
      }
    }
    return { lines, wordTimings: lines.length > 0 };
  }

  // Hand-made captions: no word times. Drop rows repeated from the previous cue and exact repeats.
  let prevRows: string[] = [];
  for (const cue of cues) {
    const rows = cue.rows.map(clean).filter(Boolean);
    let fresh = rows;
    while (fresh.length && prevRows.includes(fresh[0])) fresh = fresh.slice(1);
    prevRows = rows;
    const text = fresh.join(" ").trim();
    if (!text) continue;
    if (lines.length && lines[lines.length - 1].text === text) continue;
    lines.push({ start: cue.start, end: cue.end, text });
  }
  return { lines, wordTimings: false };
}

/** Lines only; kept for callers that don't need word timings. */
export function parseVtt(raw: string): VttLine[] {
  return parseVttTranscript(raw).lines;
}
