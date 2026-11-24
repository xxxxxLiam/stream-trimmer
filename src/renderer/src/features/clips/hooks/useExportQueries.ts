/**
 * File: useExportQueries.ts
 * Path: src/renderer/src/features/clips/hooks/useExportQueries.ts
 * Description: What the Export panel reads: this video's bank for the open campaign, the moments
 *   still waiting, and which one is the suggested next.
 */
import { useMemo, useSyncExternalStore } from "react";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { bankStore, bankedRanges, clipsFor } from "../../../shared/utils/bank";
import { suggestedNextId, waitingClips } from "../utils/exportRows";

export function useExportQueries() {
  const { videoId } = useClipperContext();
  const { active } = useCampaign();
  const data = useSyncExternalStore(bankStore.subscribe, bankStore.get, bankStore.get);

  const campaignId = active?.id ?? "";
  const vid = videoId ?? "";
  const clips = useMemo(() => (campaignId && vid ? clipsFor(data, campaignId, vid) : []), [data, campaignId, vid]);
  const waiting = useMemo(() => waitingClips(clips), [clips]);
  const nextId = useMemo(() => suggestedNextId(waiting), [waiting]);
  const planned = useMemo(() => bankedRanges(clips), [clips]);
  const gate = !active
    ? "Create a campaign to keep moments for it."
    : !vid
      ? "Open a video to see its moments."
      : "";

  return { campaignId, vid, clips, waiting, nextId, planned, gate, campaignName: active?.name ?? "" };
}
