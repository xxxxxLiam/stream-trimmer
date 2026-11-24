/**
 * File: useVideosController.ts
 * Path: src/renderer/src/features/workspace/hooks/useVideosController.ts
 * Description: Everything the Videos list needs: the open and Done videos with their campaign and
 *   waiting count, the pill search, opening a pasted link, folding a video into Done with its
 *   8 s Undo line.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { bankStore } from "../../../shared/utils/bank";
import { extractVideoId } from "../../../shared/utils/clip";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useWorkspace, type WorkspaceTab } from "./WorkspaceContext";
import { looksLikeLink, matchesVideoQuery, splitVideos, waitingIn } from "../utils/videoList";

/** How long "Moved … to Done · Undo" stays. */
export const UNDO_MS = 8000;

export type VideoRow = {
  id: string;
  title: string;
  campaign: string;
  waiting: number;
  isOpen: boolean;
  done: boolean;
};

export function useVideosController() {
  const ws = useWorkspace();
  const { campaigns } = useCampaign();
  const bank = useSyncExternalStore(bankStore.subscribe, bankStore.get, bankStore.get);
  const [pills, setPills] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [doneOpen, setDoneOpen] = useState(false);
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const toRow = useCallback(
    (t: WorkspaceTab): VideoRow => {
      const campaign = campaigns.find((c) => c.id === t.campaignId);
      return {
        id: t.id,
        title: ws.labelFor(t.id),
        campaign: campaign?.name ?? "",
        waiting: waitingIn(bank, t.campaignId, t.url ? extractVideoId(t.url) : null),
        isOpen: t.id === ws.activeId,
        done: !!t.done,
      };
    },
    [campaigns, bank, ws],
  );

  const terms = useMemo(() => [...pills, text].filter((x) => x.trim()).join(" "), [pills, text]);
  const rows = useMemo(() => {
    const { open, done } = splitVideos(ws.tabs);
    const keep = (r: VideoRow) => matchesVideoQuery(r.title, r.campaign, terms);
    return { open: open.map(toRow).filter(keep), done: done.map(toRow).filter(keep) };
  }, [ws.tabs, toRow, terms]);

  const doneVideo = useCallback(
    (row: VideoRow) => {
      ws.setTabDone(row.id, true);
      setUndo({ id: row.id, title: row.title });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setUndo(null), UNDO_MS);
    },
    [ws],
  );

  const undoDone = useCallback(() => {
    if (!undo) return;
    ws.setTabDone(undo.id, false);
    setUndo(null);
    if (timer.current) clearTimeout(timer.current);
  }, [ws, undo]);

  const submit = useCallback(() => {
    const value = text.trim();
    if (!value) return;
    if (looksLikeLink(value)) {
      const vid = extractVideoId(value);
      const same = vid ? ws.tabs.find((t) => t.url && extractVideoId(t.url) === vid) : undefined;
      if (same) {
        if (same.done) ws.setTabDone(same.id, false);
        ws.selectTab(same.id);
      } else ws.addTab(value);
    } else {
      setPills((p) => (p.includes(value) ? p : [...p, value]));
    }
    setText("");
  }, [text, ws]);

  return {
    rows,
    pills,
    text,
    setText,
    submit,
    removePill: (p: string) => setPills((all) => all.filter((x) => x !== p)),
    clearFilters: () => {
      setPills([]);
      setText("");
    },
    filtered: terms.trim() !== "",
    doneOpen,
    toggleDone: () => setDoneOpen((v) => !v),
    select: ws.selectTab,
    doneVideo,
    undo,
    undoDone,
  };
}
