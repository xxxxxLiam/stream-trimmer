/**
 * File: finishBankedCut.ts
 * Path: src/renderer/src/features/clips/utils/finishBankedCut.ts
 * Description: What a finished cut of a waiting moment records: the row flips to `cut` and its
 *   ranges join the used-ranges record. Both are written against `campaignId`, the campaign the
 *   cut STARTED in. The download takes a while and the user may switch client meanwhile;
 *   `recordUse` without an id falls back to whichever campaign is active NOW, which wrote client
 *   A's range onto client B.
 */
export function finishBankedCut(args: {
  campaignId: string;
  videoId: string;
  clipId: string;
  markCut: (campaignId: string, videoId: string, clipId: string) => { ranges: { start: number; end: number }[] } | null;
  recordUse: (
    videoId: string,
    ranges: ReadonlyArray<{ start: number; end: number }>,
    clipId: string,
    campaignId?: string,
  ) => void;
}): void {
  const res = args.markCut(args.campaignId, args.videoId, args.clipId);
  if (res) args.recordUse(args.videoId, res.ranges, args.clipId, args.campaignId);
}

type Range = { start: number; end: number };

/**
 * The waiting moment a Clip-button range is the same range as (every section within half a second),
 * so cutting it by hand marks it cut instead of leaving it Waiting under a second label on the lane.
 */
export function matchingMoment<T extends { id: string; status: string; segments: readonly Range[] }>(
  clips: readonly T[],
  segments: readonly Range[],
): T | undefined {
  const near = (a: number, b: number) => Math.abs(a - b) < 0.5;
  return clips.find(
    (c) =>
      c.status === "banked" &&
      c.segments.length === segments.length &&
      c.segments.every((s, i) => near(s.start, segments[i].start) && near(s.end, segments[i].end)),
  );
}
