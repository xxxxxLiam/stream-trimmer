/**
 * File: undoClip.ts
 * Path: src/renderer/src/features/clips/utils/undoClip.ts
 * Description: Undo for a clip just made: every file it made (the original and each language) goes
 *   to the Trash (nothing else changes if one fails, and the reason is returned), its ranges are given back to the campaign, a waiting
 *   moment goes back to waiting, and its row leaves History. It works from the History entry,
 *   which remembers the campaign, video and clip id the clip was made under.
 */
import type { DownloadEntry } from "../../../shared/utils/downloads";

/**
 * Every file that one clip made: the original and its language copies share the clip's id, so they
 * are one entry to the person. The entry alone when it has no id to match on.
 */
export function clipGroup(entry: DownloadEntry, all: readonly DownloadEntry[]): DownloadEntry[] {
  if (!entry.clipId || !entry.videoId) return [entry];
  const same = all.filter(
    (d) => d.kind === "clip" && d.clipId === entry.clipId && d.videoId === entry.videoId && d.campaignId === entry.campaignId,
  );
  return same.some((d) => d.id === entry.id) ? same : [entry, ...same];
}

export async function undoClip(args: {
  /** The clip's files: `clipGroup(entry, downloads)`. All of them are undone, or the clip stays. */
  entries: readonly DownloadEntry[];
  /** Moves the file to the Trash or Recycle Bin. Absent in the browser build: nothing to move. */
  trashFile?: (path: string) => Promise<{ ok: boolean; error?: string }>;
  forgetUse: (videoId: string, clipId: string, campaignId?: string) => void;
  backToWaiting: (campaignId: string, videoId: string, clipId: string) => void;
  removeDownload: (id: string) => void;
}): Promise<{ ok: boolean; error?: string }> {
  const { entries } = args;
  let failure: string | undefined;
  for (const entry of entries) {
    if (entry.path && args.trashFile) {
      const res = await args.trashFile(entry.path);
      if (!res.ok) {
        failure ??= res.error ?? "The file could not be moved to the Trash.";
        continue;
      }
    }
    // A file that is gone is gone: its History row leaves even if a sibling could not be moved.
    args.removeDownload(entry.id);
  }
  // The moment goes back to waiting and the day's count drops only once every file is gone.
  if (failure) return { ok: false, error: failure };
  const first = entries.find((e) => e.videoId && e.clipId);
  if (first?.videoId && first.clipId) {
    args.forgetUse(first.videoId, first.clipId, first.campaignId);
    if (first.campaignId) args.backToWaiting(first.campaignId, first.videoId, first.clipId);
  }
  return { ok: true };
}
