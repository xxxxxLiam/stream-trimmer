/**
 * File: storyboards.ts
 * Path: src/main/features/engine/utils/storyboards.ts
 * Description: Reads yt-dlp's storyboard formats (format_note "storyboard", ext mhtml) from the info
 *   already fetched, and answers "which sheet and cell holds the frame at time t". Each fragment is
 *   one JPG sprite sheet of columns x rows frames served from i.ytimg.com, so a filmstrip needs only a
 *   few small image requests and no video download. Proof only; the Renderer draws it later. Shapes
 *   follow yt-dlp's extractor (_extract_storyboard); not verified against real YouTube.
 */

export interface StoryboardLevel {
  id: string;
  /** Size of one frame in pixels. */
  width: number;
  height: number;
  columns: number;
  rows: number;
  /** Frames per second of video, so 1 / fps seconds between frames. */
  fps: number;
  sheets: { url: string; duration: number }[];
}

interface InfoFormat {
  format_id?: string;
  format_note?: string;
  width?: number;
  height?: number;
  columns?: number;
  rows?: number;
  fps?: number;
  fragments?: { url: string; duration: number }[];
}

/** Storyboard levels, smallest frame first. Empty when the video has none (live, some uploads). */
export function storyboardsOf(info: { formats?: InfoFormat[] | null }): StoryboardLevel[] {
  const out: StoryboardLevel[] = [];
  for (const f of Array.isArray(info.formats) ? info.formats : []) {
    if (f.format_note !== "storyboard") continue;
    if (!f.width || !f.height || !f.columns || !f.rows || !f.fps || !f.fragments?.length) continue;
    out.push({
      id: f.format_id ?? "",
      width: f.width,
      height: f.height,
      columns: f.columns,
      rows: f.rows,
      fps: f.fps,
      sheets: f.fragments.map((s) => ({ url: s.url, duration: s.duration })),
    });
  }
  return out.sort((a, b) => a.width - b.width);
}

/** Seconds between two frames. */
export const frameInterval = (l: StoryboardLevel) => 1 / l.fps;

/** The finest level whose frames are still at least `minWidth` wide, else the largest there is. */
export function pickLevel(levels: readonly StoryboardLevel[], minWidth: number): StoryboardLevel | null {
  if (levels.length === 0) return null;
  return levels.find((l) => l.width >= minWidth) ?? levels[levels.length - 1];
}

/** Where the frame for time `t` lives: its sheet URL and the cell inside that sheet. */
export function frameAt(level: StoryboardLevel, t: number): { url: string; col: number; row: number } {
  const perSheet = level.columns * level.rows;
  const index = Math.max(0, Math.floor(t * level.fps));
  const sheet = Math.min(Math.floor(index / perSheet), level.sheets.length - 1);
  const cell = Math.min(index - sheet * perSheet, perSheet - 1);
  return { url: level.sheets[sheet].url, col: cell % level.columns, row: Math.floor(cell / level.columns) };
}

/** What a level costs for the whole video: sheets to fetch and the pixels they hold. */
export function levelCost(level: StoryboardLevel) {
  return {
    sheets: level.sheets.length,
    frames: Math.round(level.sheets.reduce((a, s) => a + s.duration, 0) * level.fps),
    sheetPixels: [level.width * level.columns, level.height * level.rows] as const,
  };
}
