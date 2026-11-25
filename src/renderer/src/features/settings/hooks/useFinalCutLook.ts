/**
 * File: useFinalCutLook.ts
 * Path: src/renderer/src/features/settings/hooks/useFinalCutLook.ts
 * Description: The "Your look" row's state and actions for one campaign. Reads the saved looks, adds a
 *   chosen or dropped Final Cut export through the main process, points the campaign at a look (or at
 *   none), and deletes a look no campaign uses. A refused file or delete becomes one plain sentence.
 */
import { useCallback, useRef, useState } from "react";
import type { Campaign } from "../../../shared/utils/campaigns";
import { addPickedLook, deleteSavedLook, loadSavedLooks, saveSavedLooks, type SavedLook } from "../../../shared/utils/fcpLooks";
import type { FcpLookFileResult } from "../../../../../common/types/fcpLook";
import type { FinalCutLookProps } from "../components/FinalCutLook";

type Campaigns = { campaigns: Campaign[]; update: (id: string, patch: Partial<Omit<Campaign, "id" | "usedRanges">>) => void };

export function useFinalCutLook(campaign: Campaign | undefined, store: Campaigns): FinalCutLookProps | undefined {
  const [looks, setLooks] = useState<SavedLook[]>(() => loadSavedLooks());
  const [problem, setProblem] = useState("");
  const [open, setOpen] = useState(false);
  const [guide, setGuide] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const campaignId = campaign?.id;

  const adopt = useCallback(
    (result: FcpLookFileResult) => {
      const added = addPickedLook(result);
      if (!added.ok) {
        if (!added.cancelled) setProblem(added.reason);
        return;
      }
      setProblem("");
      setLooks(loadSavedLooks());
      if (campaignId) store.update(campaignId, { fcpLookId: added.id });
      setOpen(false);
    },
    [campaignId, store],
  );

  if (!campaign) return undefined;
  const api = window.electronAPI;
  const current = looks.find((l) => l.id === campaign.fcpLookId);

  return {
    saved: looks.map((l) => ({ id: l.id, name: l.name })),
    currentId: current?.id ?? null,
    found: current ? current.look.found.join(", ") : "",
    problem,
    open,
    guide,
    inputRef,
    usedIds: store.campaigns.flatMap((c) => (c.fcpLookId ? [c.fcpLookId] : [])),
    onToggleOpen: () => setOpen((v) => !v),
    onToggleGuide: () => setGuide((v) => !v),
    onChoose: () => void api?.pickFinalCutLook?.().then(adopt),
    onFile: (file) => void api?.readFinalCutLook?.(file).then(adopt),
    onPick: (id) => {
      setProblem("");
      store.update(campaign.id, { fcpLookId: id ?? undefined });
      setOpen(false);
    },
    onRemove: (id) => {
      const result = deleteSavedLook(looks, store.campaigns, id);
      if (!result.ok) {
        setProblem(`${result.usedBy.join(", ")} uses this look. Pick another look there first.`);
        return;
      }
      saveSavedLooks(result.looks);
      setLooks(result.looks);
      setProblem("");
    },
  };
}
