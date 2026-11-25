/**
 * File: channelData.ts
 * Path: src/renderer/src/features/channelExport/utils/channelData.ts
 * Description: The Channel data sidebar's small rules: the steps of "Top N by views", the one-line
 *   time estimate, and how the last export reads. The estimate is the code's rough figure, not measured.
 */

/** What the − and + buttons walk through. */
export const LIMIT_STEPS = [10, 25, 50, 100, 200, 500, 1000] as const;

export const DEFAULT_LIMIT = 100;

/** Seconds per video: the details pass (it supplies the view counts) plus the transcript pass. */
const SECONDS_PER_VIDEO = 4 + 3;

/** The next step up or down from a typed count; a count between steps snaps to the next one in that direction. */
export function stepLimit(n: number, dir: 1 | -1): number {
  const steps = LIMIT_STEPS as readonly number[];
  if (dir === 1) return steps.find((s) => s > n) ?? steps[steps.length - 1];
  return [...steps].reverse().find((s) => s < n) ?? steps[0];
}

export function estimateMinutes(count: number): number {
  return Math.max(1, Math.round((count * SECONDS_PER_VIDEO) / 60));
}

export function estimateLine(count: number): string {
  return `About ${estimateMinutes(count)} min`;
}

/** "100 videos · 74,210 transcript lines" for the Last export row. */
export function lastExportDetail(r: { videos: number; transcripts: number }): string {
  return `${r.videos.toLocaleString("en-US")} videos · ${r.transcripts.toLocaleString("en-US")} transcript lines`;
}
