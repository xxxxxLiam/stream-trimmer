/**
 * File: useExportMutations.ts
 * Path: src/renderer/src/features/clips/hooks/useExportMutations.ts
 * Description: What the Export panel does: pick a waiting moment (load it on the timeline), make
 *   it, undo the clip just made, remove a moment, and import timestamps.
 */
import { useCallback } from "react";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { bankStore, type BankedClip } from "../../../shared/utils/bank";
import type { ParsedClip } from "../../../shared/utils/bankImport";
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
  const { cutBanked } = usePanelHost();
  const { recordUse, forgetUse } = useCampaign();
  const { removeDownload } = useClipperContext();
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

  const undo = useCallback(() => {
    const entry = getDownloads().find((d) => d.id === s.finished?.entryId);
    s.setFinished(null);
    if (!entry) return;
    undoClip({
      entry,
      forgetUse,
      backToWaiting: (c, v, id) => bankStore.setStatus(c, v, id, "banked"),
      removeDownload,
    });
  }, [s, forgetUse, removeDownload]);

  const remove = useCallback(
    (clip: BankedClip) => bankStore.remove(campaignId, vid, clip.id),
    [campaignId, vid],
  );

  const importClips = useCallback(
    (parsed: ParsedClip[]) => {
      bankStore.importClips(campaignId, vid, parsed);
      s.setImporting(false);
    },
    [campaignId, vid, s],
  );

  return { select, make, undo, remove, importClips };
}
