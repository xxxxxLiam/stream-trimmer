/**
 * File: useFinalCutLook.ts
 * Path: src/renderer/src/features/settings/hooks/useFinalCutLook.ts
 * Description: The "Your look" row's state and actions for one campaign. Reads the saved looks, adds a
 *   chosen or dropped Final Cut export through the main process, points the campaign at a look (or at
 *   none), and deletes a look no campaign uses. A refused file or delete becomes one plain sentence.
 */
import { useCallback, useRef, useState } from "react";
import { readSetting } from "../../../shared/utils/persist";
import type { Campaign } from "../../../shared/utils/campaigns";
import { KEY_LOOK_UNREAD, addPickedLook, deleteSavedLook, loadSavedLooks, rememberLastLook, saveSavedLooks, type SavedLook } from "../../../shared/utils/fcpLooks";
import type { FcpLookFileResult } from "../../../../../common/types/fcpLook";
import type { FinalCutLookProps } from "../components/FinalCutLook";

type Campaigns = { campaigns: Campaign[]; update: (id: string, patch: Partial<Omit<Campaign, "id" | "usedRanges">>) => void };

export function useFinalCutLook(campaign: Campaign | undefined, store: Campaigns, onUploaded?: () => void): FinalCutLookProps | undefined {
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
        // A cancelled pick is not a failure: the sentence from the last try goes away.
        setProblem(added.cancelled ? "" : added.reason);
        return;
      }
      setProblem("");
      rememberLastLook(added.id);
      setLooks(loadSavedLooks());
      if (campaignId) store.update(campaignId, { fcpLookId: added.id });
      // A look that was just uploaded switches the Timeline to "From your look" by itself.
      onUploaded?.();
      setOpen(false);
    },
    [campaignId, store, onUploaded],
  );

  if (!campaign) return undefined;
  const api = window.electronAPI;
  const current = looks.find((l) => l.id === campaign.fcpLookId);
  // D2-4: an old pasted look that was switched on but could not be read is said once here, until a look is chosen.
  const unread = readSetting<Record<string, boolean>>(KEY_LOOK_UNREAD, {});
  const unreadNote = !campaign.fcpLookId && (unread[campaign.id] || unread["*"]) ? "Your old pasted look could not be read, so no look is applied. Choose your Final Cut export again." : "";

  return {
    saved: looks.map((l) => ({ id: l.id, name: l.name })),
    currentId: current?.id ?? null,
    found: current ? current.look.found.join(", ") : "",
    problem,
    unreadNote,
    open,
    guide,
    inputRef,
    usedBy: store.campaigns.reduce<Record<string, string[]>>((m, c) => {
      if (c.fcpLookId) (m[c.fcpLookId] ??= []).push(c.name);
      return m;
    }, {}),
    onToggleOpen: () => setOpen((v) => !v),
    onToggleGuide: () => setGuide((v) => !v),
    onChoose: () => void api?.pickFinalCutLook?.().then(adopt),
    onFile: (file) => void api?.readFinalCutLook?.(file).then(adopt),
    onPick: (id) => {
      setProblem("");
      if (id) rememberLastLook(id);
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
