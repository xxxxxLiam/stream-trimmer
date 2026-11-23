/**
 * File: vtt.ts
 * Path: server/utils/vtt.ts
 * Description: Parses a WebVTT transcript into timed lines.
 */


interface VttLine {
  start: number;
  end: number;
  text: string;
}

export function parseVtt(raw: string): VttLine[] {
  const lines: VttLine[] = [];
  const blocks = raw.replace(/\r/g, "").split("\n\n");
  const tc =
    /(\d{2}):(\d{2}):(\d{2})\.(\d{3})\s+-->\s+(\d{2}):(\d{2}):(\d{2})\.(\d{3})/;
  const toSec = (h: number, m: number, s: number) => h * 3600 + m * 60 + s;
  for (const block of blocks) {
    const rows = block.split("\n");
    const timing = rows.find((r) => tc.test(r));
    if (!timing) continue;
    const m = timing.match(tc)!;
    const start = toSec(+m[1], +m[2], +m[3]);
    const end = toSec(+m[5], +m[6], +m[7]);
    const text = rows
      .filter((r) => !tc.test(r) && r.trim() && !/^\d+$/.test(r) && r !== "WEBVTT")
      .join(" ")
      .replace(/<[^>]+>/g, "")
      .trim();
    if (text) lines.push({ start, end, text });
  }
  return lines.filter((l, i) => i === 0 || l.text !== lines[i - 1].text);
}
