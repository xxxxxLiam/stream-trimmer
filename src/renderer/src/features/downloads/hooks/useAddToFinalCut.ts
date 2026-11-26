/**
 * File: useAddToFinalCut.ts
 * Path: src/renderer/src/features/downloads/hooks/useAddToFinalCut.ts
 * Description: Add to Final Cut for the History panel: which rows offer it (location clips, Mac only, Final Cut installed),
 *   the add itself (one clip from its ⋯, or the ticked ones from the select bar), and the sentence it ends with.
 */
import { useCallback, useState } from "react";
import { useFinalCutInstalled } from "../../../shared/hooks/useFinalCutInstalled";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import type { DownloadEntry } from "../../../shared/utils/downloads";
import { markInFinalCut } from "../../../shared/utils/inFinalCutStore";
import { addToFinalCut, type FinalCutBridge } from "../utils/addToFinalCut";

export function useAddToFinalCut() {
  const { campaigns } = useCampaign();
  const installed = useFinalCutInstalled();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  /** The location's name when this clip was saved in one, else null. */
  const locationOf = useCallback(
    (e: DownloadEntry): string | null => campaigns.find((c) => c.id === e.campaignId && c.kind === "location")?.name ?? null,
    [campaigns],
  );
  const canAdd = useCallback((e: DownloadEntry) => installed && Boolean(e.path) && locationOf(e) !== null, [installed, locationOf]);

  const add = useCallback(
    async (entries: readonly DownloadEntry[]): Promise<boolean> => {
      if (busy) return false;
      const items = entries.flatMap((entry) => {
        const location = locationOf(entry);
        return location ? [{ entry, location }] : [];
      });
      setBusy(true);
      setNotice(null);
      try {
        const r = await addToFinalCut(items, window.electronAPI as unknown as FinalCutBridge | undefined);
        if (r.state === "cancelled") return false;
        if (r.state === "failed") {
          setNotice({ ok: false, text: r.message });
          return false;
        }
        markInFinalCut([...r.added, ...r.already]);
        setNotice({ ok: true, text: r.message });
        return true;
      } catch (err) {
        setNotice({ ok: false, text: err instanceof Error ? err.message : String(err) });
        return false;
      } finally {
        setBusy(false);
      }
    },
    [busy, locationOf],
  );

  return { canAdd, add, busy, notice, clearNotice: () => setNotice(null) };
}
