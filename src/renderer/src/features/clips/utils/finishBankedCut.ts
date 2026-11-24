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
