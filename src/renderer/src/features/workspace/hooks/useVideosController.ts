/**
 * File: useVideosController.ts
 * Path: src/renderer/src/features/workspace/hooks/useVideosController.ts
 * Description: Everything the Videos list needs: the open and Done videos with their campaign and
 *   waiting count, the pill search, opening a pasted link, folding a video into Done with its
 *   8 s Undo line.
 */
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import { bankStore } from "../../../shared/utils/bank";
import { extractVideoId } from "../../../shared/utils/clip";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useWorkspace, type WorkspaceTab } from "./WorkspaceContext";
import { doneUndoStore } from "../utils/doneUndoStore";
import { useMakingClipId } from "../../../shared/utils/clipNameStore";
import { linkInText, linkKind, matchesVideoQuery, splitVideos, waitingIn } from "../utils/videoList";

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
  const { loadingInfo, info } = useClipperContext();
  /** The open video is still being read: its row says "Opening…" until the title arrives. */
  const opening = loadingInfo && !info;
  const { campaigns } = useCampaign();
  const makingId = useMakingClipId();
  const bank = useSyncExternalStore(bankStore.subscribe, bankStore.get, bankStore.get);
  const [pills, setPills] = useState<string[]>([]);
  const [text, setText] = useState("");
  const [doneOpen, setDoneOpen] = useState(false);
  /** One line under the search when a pasted link cannot be opened (B-6). */
  const [linkError, setLinkError] = useState("");
  const undo = useSyncExternalStore(doneUndoStore.subscribe, doneUndoStore.get, doneUndoStore.get);

  const toRow = useCallback(
    (t: WorkspaceTab): VideoRow => {
      const campaign = campaigns.find((c) => c.id === t.campaignId);
      return {
        id: t.id,
        title: ws.labelFor(t.id),
        campaign: campaign?.name ?? "",
        waiting: waitingIn(bank, t.campaignId, t.url ? extractVideoId(t.url) : null, makingId),
        isOpen: t.id === ws.activeId,
        done: !!t.done,
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
    ws.setTabDone(undo.id, false);
    doneUndoStore.clear();
  }, [ws, undo]);

  const submitValue = useCallback((raw: string) => {
    const value = raw.trim();
    if (!value) return;
    // Pasted share text: the video link inside it opens, the rest is dropped (B2-5).
    const inside = /\s/.test(value) ? linkInText(value) : null;
    const target = inside ?? value;
    const kind = inside ? "video" : linkKind(value);
    if (kind === "bad") {
      setLinkError("That isn't a YouTube video link");
      return;
    }
    setLinkError("");
    if (kind === "video") {
      const vid = extractVideoId(target);
      const same = vid ? ws.tabs.find((t) => t.url && extractVideoId(t.url) === vid) : undefined;
      if (same) {
        if (same.done) ws.setTabDone(same.id, false);
        ws.selectTab(same.id);
      } else ws.addTab(target);
    } else {
      setPills((p) => (p.includes(value) ? p : [...p, value]));
    }
    setText("");
  }, [ws]);

  const submit = useCallback(() => submitValue(text), [submitValue, text]);

  return {
    opening,
    rows,
    pills,
    text,
    setText: (t: string) => {
      setText(t);
      setLinkError("");
    },
    linkError,
    submit,
    /** True when pasted text held a video link and it was opened, so the box should take nothing. */
    pasteText: (pasted: string): boolean => {
      if (!/\s/.test(pasted.trim()) || !linkInText(pasted)) return false;
      submitValue(pasted);
      return true;
    },
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
