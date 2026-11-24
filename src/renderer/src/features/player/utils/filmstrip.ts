/**
 * File: filmstrip.ts
 * Path: src/renderer/src/features/player/utils/filmstrip.ts
 * Description: Which storyboard sheet and cell holds the frame at a time, and which level to use for
 *   a lane of a given height. Pure, so the Source lane is a plain loop over tiles.
 */
import type { StoryboardLevel } from "../../../../../common/types/storyboard";

export type FrameCell = { sheet: number; col: number; row: number };

export function frameAt(level: StoryboardLevel, t: number): FrameCell {
  const perSheet = level.columns * level.rows;
  const index = Math.max(0, Math.floor(t * level.fps));
  const inSheet = index % perSheet;
  return {
    sheet: Math.min(level.sheets.length - 1, Math.floor(index / perSheet)),
    col: inSheet % level.columns,
    row: Math.floor(inSheet / level.columns),
  };
}

/** The smallest level whose frames are at least as tall as the lane; else the biggest. */
export function levelForHeight(levels: readonly StoryboardLevel[] | undefined, heightPx: number): StoryboardLevel | null {
  if (!levels || levels.length === 0) return null;
  const sorted = [...levels].sort((a, b) => a.height - b.height);
  return sorted.find((l) => l.height >= heightPx) ?? sorted[sorted.length - 1];
}
