/**
 * File: undoClip.ts
 * Path: src/renderer/src/features/clips/utils/undoClip.ts
 * Description: Undo for a clip just made: its ranges are given back to the campaign, a waiting
 *   moment goes back to waiting, and its row leaves History. It works from the History entry,
 *   which remembers the campaign, video and clip id the clip was made under.
 */
import type { DownloadEntry } from "../../../shared/utils/downloads";

export function undoClip(args: {
  entry: DownloadEntry;
  forgetUse: (videoId: string, clipId: string, campaignId?: string) => void;
  backToWaiting: (campaignId: string, videoId: string, clipId: string) => void;
  removeDownload: (id: string) => void;
}): void {
  const { entry } = args;
  if (entry.videoId && entry.clipId) {
    args.forgetUse(entry.videoId, entry.clipId, entry.campaignId);
    if (entry.campaignId) args.backToWaiting(entry.campaignId, entry.videoId, entry.clipId);
  }
  args.removeDownload(entry.id);
}
