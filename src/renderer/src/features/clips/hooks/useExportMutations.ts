/**
 * File: useExportMutations.ts
 * Path: src/renderer/src/features/clips/hooks/useExportMutations.ts
 * Description: What the Export panel does: pick a waiting moment (load it on the timeline), make
 *   it, undo the clip just made, remove a moment.
 */
import { sourceLinkFor } from "../../../shared/utils/videoSource";
import { useCallback, useEffect, useRef } from "react";
import { clearAfterCuttingOutcome } from "../../handoff/components/EditorHandoff";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import type { Segment } from "../../../shared/utils/segments";
import { bankStore, clipsFor, type BankedClip } from "../../../shared/utils/bank";
import { getDownloads } from "../../../shared/utils/downloads";
import { playFrom } from "../../../shared/utils/playFrom";
import { usePanelHost } from "../../../modules/layout/hooks/PanelHostContext";
import { finishBankedCut } from "../utils/finishBankedCut";
import { suggestProjectName } from "../utils/projectName";
import { clipGroup, undoClip } from "../utils/undoClip";
import { UNDO_SECONDS } from "../utils/exportRows";
import { clipNameFor } from "../utils/cutNaming";
import { createSerialQueue } from "../utils/serialQueue";
import { onMakeRequest } from "../../../shared/utils/makeRequest";
import { setCutAttempt } from "../../../shared/utils/cutAttempt";
import { withFinished, type ExportState } from "./useExportState";
import type { useExportQueries } from "./useExportQueries";

export function useExportMutations(q: ReturnType<typeof useExportQueries>, s: ExportState) {
  const seg = useSegmentsState();
  const { cutBanked, cutAgain } = usePanelHost();
  const { recordUse, forgetUse, folders, pickClipsDir } = useCampaign();
  const { removeDownload, pickSaveDir, saveDir, info, cancelDownload, setStartText, setEndText, startText, endText } = useClipperContext();
  const stopped = useRef(false);
  const { campaignId, vid } = q;

  // Nothing left on the timeline (Clip pressed, Esc, a click on empty timeline, the trash): no bank row stays selected.
  const timelineEmpty = seg.segments.length === 0 && startText.trim() === "" && endText.trim() === "";
  const { selectedId, setSelectedId } = s;
  useEffect(() => {
    if (timelineEmpty && selectedId) setSelectedId(null);
  }, [timelineEmpty, selectedId, setSelectedId]);

  const select = useCallback(
    (clip: BankedClip) => {
      s.setSelectedId(clip.id);
      // Opening a clip that ran past the end is the person seeing it: the line has done its job.
      if (clip.ranPastEnd !== undefined && campaignId && vid) bankStore.clearRanPastEnd(campaignId, vid, clip.id);
      // The loaded range is this bank item: edits on the timeline edit it, and Clip makes it.
      seg.load(clip.segments, clip.id);
      if (clip.segments[0]) playFrom(clip.segments[0].start);
    },
    [seg, s, campaignId, vid],
  );

  // Clips are made one after another: "Make this clip" while another is making joins the queue, and
  // each one's name, Making row and Undo belong to it from the moment it starts.
  const queue = useRef(createSerialQueue());
  const make = useCallback(
    (clip: BankedClip): Promise<void> => {
      if (!campaignId || !vid) return Promise.resolve();
      const run = async () => {
        // One name: the clip's own when it is a good one, else the suggestion, else two words of the
        // video's title. A name already saved for this video gets " 2".
        const taken = getDownloads().map((d) => d.label.replace(/\.[^.]+$/, ""));
        const name = clipNameFor({ candidates: [clip.label, suggestProjectName(clip)], videoTitle: info?.title, taken });
        s.setFailed(null);
        s.attempt.current = { name, segments: clip.segments, bankId: clip.id };
        setCutAttempt({ name, segments: clip.segments, bankId: clip.id });
        s.setNotice("");
        stopped.current = false;
        clearAfterCuttingOutcome(); // the last clip's handoff answer is old news once the next one starts
        try {
          const ok = await cutBanked(clip, name);
          if (ok) {
            finishBankedCut({ campaignId, videoId: vid, clipId: clip.id, markCut: bankStore.markCut, recordUse });
            // Liam 26 Nov: a clip that has been made is no longer the selection. If it is the one on the timeline, the
            // timeline and the marks go empty so the next clip can be marked by hand; otherwise what is marked is left alone.
            if (seg.store.get().bankId === clip.id) {
              seg.clear();
              setStartText("");
              setEndText("");
              s.setSelectedId((cur) => (cur === clip.id ? null : cur));
            }
            // Its own Undo, even when the next queued clip starts at once.
            const newest = getDownloads().find((d) => d.kind === "clip");
            if (newest) {
              s.setFinished((list) => withFinished(list, { entryId: newest.id, name, endsAt: Date.now() + UNDO_SECONDS * 1000 }));
            }
          } else if (!stopped.current) s.setNotice(`${name} was not made. It is still waiting.`);
        } catch {
          if (!stopped.current) s.setNotice(`${name} was not made. It is still waiting.`);
        }
      };
      return queue.current.enqueue(run);
    },
    [campaignId, vid, cutBanked, recordUse, s, info?.title, seg, setStartText, setEndText],
  );

  // The bottom Clip button with a waiting moment loaded: the same as that moment's own Clip now (its name, its Making row, its Undo).
  const makeRef = useRef(make);
  makeRef.current = make;
  useEffect(
    () =>
      onMakeRequest((r) => {
        if (r.campaignId !== campaignId || r.videoId !== vid) return false;
        const clip = clipsFor(bankStore.get(), r.campaignId, r.videoId).find((c) => c.id === r.clipId && c.status === "banked");
        if (!clip) return false;
        void makeRef.current(clip);
        return true;
      }),
    [campaignId, vid],
  );

  // The ✕ / Esc on the Making row: the clip goes back to Waiting with its range kept, no notice, no confirm.
  const stop = useCallback(() => {
    stopped.current = true;
    cancelDownload();
  }, [cancelDownload]);

  const undo = useCallback(async (entryId: string) => {
    const entry = getDownloads().find((d) => d.id === entryId);
    s.setFinished((list) => list.filter((f) => f.entryId !== entryId));
    if (!entry) return;
    const res = await undoClip({
      entries: clipGroup(entry, getDownloads()),
      trashFile: window.electronAPI?.undoClip,
      forgetUse,
      backToWaiting: (c, v, id) => bankStore.setStatus(c, v, id, "banked"),
      removeDownload,
    });
    if (!res.ok) s.setNotice(res.error ?? "The clip could not be undone.");
  }, [s, forgetUse, removeDownload]);

  const rerun = useCallback(
    (f: { name: string; segments: Segment[]; bankId?: string }) => {
      const clip = f.bankId ? q.clips.find((c) => c.id === f.bankId) : undefined;
      if (clip) {
        void make(clip);
        return;
      }
      s.setFailed(null);
      s.attempt.current = { name: f.name, segments: f.segments };
      cutAgain(f.segments, f.name);
    },
    [s, q.clips, make, cutAgain],
  );
  const retry = useCallback(() => {
    if (s.failed) rerun(s.failed);
  }, [s.failed, rerun]);
  // The connection is back: the same cut again, from where it stopped (the engine keeps what it fetched).
  const resume = useCallback(() => {
    const o = s.offline;
    if (!o) return;
    s.setOffline(null);
    rerun(o);
  }, [s, rerun]);

  // The new folder lands in state after the picker closes, so retry through refs that always hold
  // the latest render, and only when the folder really changed.
  // The folder the cut used is the campaign's own when it has one (it overrides the global one), so
  // that is the one changed; the global picker is only for a campaign-less cut.
  const where = folders.clipsDir || saveDir;
  const latest = useRef({ retry, where });
  latest.current = { retry, where };
  const changeFolder = useCallback(async () => {
    const before = latest.current.where;
    if (campaignId) await pickClipsDir(campaignId);
    else await pickSaveDir();
    // The new folder reaches this hook a render later; wait for it (up to half a second), then cut again.
    for (let i = 0; i < 10 && latest.current.where === before; i++) await new Promise((r) => window.setTimeout(r, 50));
    if (latest.current.where !== before) latest.current.retry();
  }, [pickSaveDir, pickClipsDir, campaignId]);

  const showFolder = useCallback(() => {
    const dir = latest.current.where;
    if (dir) void window.electronAPI?.editor?.reveal?.(dir);
  }, []);

  const { openSignIn } = usePanelHost();
  const signIn = useCallback(() => openSignIn(), [openSignIn]);

  const showInBrowser = useCallback(() => {
    if (vid) window.open(sourceLinkFor(vid), "_blank", "noopener");
  }, [vid]);

  /** A moment already waiting stays waiting; a marked part that was never banked joins the bank. */
  const saveForLater = useCallback(() => {
    const f = s.failed;
    if (f && !f.bankId && campaignId && vid) {
      bankStore.importClips(campaignId, vid, [{ line: 1, id: null, label: f.name === "New clip" ? "" : f.name, segments: f.segments }]);
    }
    s.setFailed(null);
  }, [s, campaignId, vid]);

  const rename = useCallback(
    (clip: BankedClip, label: string) => bankStore.rename(campaignId, vid, clip.id, label),
    [campaignId, vid],
  );

  const remove = useCallback(
    (clip: BankedClip) => bankStore.remove(campaignId, vid, clip.id),
    [campaignId, vid],
  );

  return { select, make, stop, undo, rename, remove, retry, resume, changeFolder, showFolder, folder: where, showInBrowser, saveForLater, signIn };
}
