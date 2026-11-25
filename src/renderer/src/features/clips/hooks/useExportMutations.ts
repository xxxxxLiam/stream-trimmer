/**
 * File: useExportMutations.ts
 * Path: src/renderer/src/features/clips/hooks/useExportMutations.ts
 * Description: What the Export panel does: pick a waiting moment (load it on the timeline), make
 *   it, undo the clip just made, remove a moment.
 */
import { useCallback, useRef } from "react";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { bankStore, type BankedClip } from "../../../shared/utils/bank";
import { getDownloads } from "../../../shared/utils/downloads";
import { playFrom } from "../../../shared/utils/playFrom";
import { usePanelHost } from "../../../modules/layout/hooks/PanelHostContext";
import { validateClipName } from "../utils/clipName";
import { finishBankedCut } from "../utils/finishBankedCut";
import { suggestProjectName } from "../utils/projectName";
import { undoClip } from "../utils/undoClip";
import type { ExportState } from "./useExportState";
import type { useExportQueries } from "./useExportQueries";

export function useExportMutations(q: ReturnType<typeof useExportQueries>, s: ExportState) {
  const seg = useSegmentsState();
  const { cutBanked, cutSegments } = usePanelHost();
  const { recordUse, forgetUse } = useCampaign();
  const { removeDownload, pickSaveDir, saveDir } = useClipperContext();
  const { campaignId, vid } = q;

  const select = useCallback(
    (clip: BankedClip) => {
      s.setSelectedId(clip.id);
      seg.load(clip.segments);
      if (clip.segments[0]) playFrom(clip.segments[0].start);
    },
    [seg, s],
  );

  const make = useCallback(
    async (clip: BankedClip) => {
      if (!campaignId || !vid) return;
      // A clip's own label is its name when it is a good one; otherwise the offline suggestion.
      const name = validateClipName(clip.label).ok ? clip.label.trim() : suggestProjectName(clip);
      s.setMakingName(name || clip.id);
      s.setFailed(null);
      s.setMakingId(clip.id);
      s.attempt.current = { name: name || clip.id, segments: clip.segments, bankId: clip.id };
      s.setNotice("");
      s.setFinished(null);
      try {
        const ok = await cutBanked(clip, name);
        if (ok) finishBankedCut({ campaignId, videoId: vid, clipId: clip.id, markCut: bankStore.markCut, recordUse });
        else s.setNotice(`${name || clip.id} was not made. It is still waiting.`);
      } catch {
        s.setNotice(`${name || clip.id} was not made. It is still waiting.`);
      }
    },
    [campaignId, vid, cutBanked, recordUse, s],
  );

  const undo = useCallback(async () => {
    const entry = getDownloads().find((d) => d.id === s.finished?.entryId);
    s.setFinished(null);
    if (!entry) return;
    const res = await undoClip({
      entry,
      trashFile: window.electronAPI?.undoClip,
      forgetUse,
      backToWaiting: (c, v, id) => bankStore.setStatus(c, v, id, "banked"),
      removeDownload,
    });
    if (!res.ok) s.setNotice(res.error ?? "The clip could not be undone.");
  }, [s, forgetUse, removeDownload]);

  const retry = useCallback(() => {
    const f = s.failed;
    if (!f) return;
    const clip = f.bankId ? q.clips.find((c) => c.id === f.bankId) : undefined;
    if (clip) {
      void make(clip);
      return;
    }
    s.setFailed(null);
    s.attempt.current = { name: f.name, segments: f.segments };
    cutSegments(f.segments);
  }, [s, q.clips, make, cutSegments]);

  // The new folder lands in state after the picker closes, so retry through refs that always hold
  // the latest render, and only when the folder really changed.
  const latest = useRef({ retry, saveDir });
  latest.current = { retry, saveDir };
  const changeFolder = useCallback(async () => {
    const before = latest.current.saveDir;
    await pickSaveDir();
    await new Promise((r) => window.setTimeout(r, 50));
    if (latest.current.saveDir !== before) latest.current.retry();
  }, [pickSaveDir]);

  const showInBrowser = useCallback(() => {
    if (vid) window.open(`https://www.youtube.com/watch?v=${vid}`, "_blank", "noopener");
  }, [vid]);

  /** A moment already waiting stays waiting; a marked part that was never banked joins the bank. */
  const saveForLater = useCallback(() => {
    const f = s.failed;
    if (f && !f.bankId && campaignId && vid) {
      bankStore.importClips(campaignId, vid, [{ line: 1, id: null, label: f.name === "New clip" ? "" : f.name, segments: f.segments }]);
    }
    s.setFailed(null);
  }, [s, campaignId, vid]);

  const remove = useCallback(
    (clip: BankedClip) => bankStore.remove(campaignId, vid, clip.id),
    [campaignId, vid],
  );

  return { select, make, undo, remove, retry, changeFolder, showInBrowser, saveForLater };
}
