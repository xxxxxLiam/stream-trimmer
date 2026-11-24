/**
 * File: undoClip.ts
 * Path: src/renderer/src/features/clips/utils/undoClip.ts
 * Description: Undo for a clip just made: its file goes to the Trash (nothing else changes if that
 *   fails, and the reason is returned), its ranges are given back to the campaign, a waiting
 *   moment goes back to waiting, and its row leaves History. It works from the History entry,
 *   which remembers the campaign, video and clip id the clip was made under.
 */
import type { DownloadEntry } from "../../../shared/utils/downloads";

export async function undoClip(args: {
  entry: DownloadEntry;
  /** Moves the file to the Trash or Recycle Bin. Absent in the browser build: nothing to move. */
  trashFile?: (path: string) => Promise<{ ok: boolean; error?: string }>;
  forgetUse: (videoId: string, clipId: string, campaignId?: string) => void;
  backToWaiting: (campaignId: string, videoId: string, clipId: string) => void;
  removeDownload: (id: string) => void;
}): Promise<{ ok: boolean; error?: string }> {
  const { entry } = args;
  if (entry.path && args.trashFile) {
    const res = await args.trashFile(entry.path);
    if (!res.ok) return { ok: false, error: res.error ?? "The file could not be moved to the Trash." };
  }
  if (entry.videoId && entry.clipId) {
    args.forgetUse(entry.videoId, entry.clipId, entry.campaignId);
    if (entry.campaignId) args.backToWaiting(entry.campaignId, entry.videoId, entry.clipId);
  }
  args.removeDownload(entry.id);
  return { ok: true };
}
