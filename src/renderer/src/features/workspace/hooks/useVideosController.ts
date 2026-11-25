/**
 * File: useVideosController.ts
 * Path: src/renderer/src/features/workspace/hooks/useVideosController.ts
 * Description: Everything the Videos list needs: the open and Done videos with their campaign and
 *   waiting count, the pill search, opening a pasted link, folding a video into Done with its
 *   8 s Undo line.
 */
import { sourceLinkFor } from "../../../shared/utils/videoSource";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { bankStore } from "../../../shared/utils/bank";
import { extractVideoId } from "../../../shared/utils/clip";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useWorkspace, type WorkspaceTab } from "./WorkspaceContext";
import { doneUndoStore } from "../utils/doneUndoStore";
import { useMakingClipId } from "../../../shared/utils/clipNameStore";
import { matchesVideoQuery, splitVideos, waitingIn } from "../utils/videoList";

export type VideoRow = {
  id: string;
  /** The YouTube id, for the thumbnail. */
  videoId: string | null;
  title: string;
  campaign: string;
  waiting: number;
  isOpen: boolean;
  done: boolean;
  /** The video's link, for "Open on YouTube". */
  url: string | null;
};

export function useVideosController() {
  const ws = useWorkspace();
  const { loadingInfo, info } = useClipperContext();
  /** The open video is still being read: its row says "Opening…" until the title arrives. */
  const opening = loadingInfo && !info;
  const { campaigns } = useCampaign();
  const makingId = useMakingClipId();
  const bank = useSyncExternalStore(bankStore.subscribe, bankStore.get, bankStore.get);
  const [pills, setPills] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [doneOpen, setDoneOpen] = useState(false);
  const undo = useSyncExternalStore(doneUndoStore.subscribe, doneUndoStore.get, doneUndoStore.get);

  const toRow = useCallback(
    (t: WorkspaceTab): VideoRow => {
      const campaign = campaigns.find((c) => c.id === t.campaignId);
      return {
        id: t.id,
        videoId: t.url ? extractVideoId(t.url) : null,
        title: ws.labelFor(t.id),
        campaign: campaign?.name ?? "",
        waiting: waitingIn(bank, t.campaignId, t.url ? extractVideoId(t.url) : null, makingId),
        isOpen: t.id === ws.activeId,
        done: !!t.done,
        url: t.url ?? null,
      };
    },
    [campaigns, bank, ws, makingId],
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
      doneUndoStore.show({ id: row.id, title: row.title });
    },
    [ws],
  );

  const undoDone = useCallback(() => {
    if (!undo) return;
    if (undo.kind === "removed") ws.reopenTab(undo.id);
    else ws.setTabDone(undo.id, false);
    doneUndoStore.clear();
  }, [ws, undo]);

  /** Remove video: no question; the 8 s Undo brings the whole tab back, marks and waiting clips included. */
  const removeVideo = useCallback(
    (row: VideoRow) => {
      if (!ws.closeTab(row.id, { silent: true })) return;
      doneUndoStore.show({ id: row.id, title: row.title, kind: "removed" });
    },
    [ws],
  );

  const openOnYouTube = useCallback((row: VideoRow) => {
    if (row.videoId) window.open(sourceLinkFor(row.videoId), "_blank", "noopener");
  }, []);

  const undoneDone = useCallback((row: VideoRow) => ws.setTabDone(row.id, false), [ws]);

  /** Clicking the open video again closes it: the workspace goes back to empty, its marks stay on the video. */
  const toggleOpen = useCallback(
    (row: VideoRow) => {
      if (!row.isOpen) return ws.selectTab(row.id);
      const blank = ws.tabs.find((t) => !t.url && t.id !== row.id);
      if (blank) ws.selectTab(blank.id);
      else ws.addTab();
    },
    [ws],
  );

  /** Enter turns the typed words into a filter pill. Links are not taken here: they go in the top bar's field. */
  const submit = useCallback(() => {
    const value = text.trim();
    if (!value) return;
    setPills((p) => (p.includes(value) ? p : [...p, value]));
    setText("");
  }, [text]);

  return {
    opening,
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
    toggleOpen,
    removeVideo,
    openOnYouTube,
    undoneDone,
    doneVideo,
    undo,
    undoDone,
  };
}
