/**
 * File: useExportController.ts
 * Path: src/renderer/src/features/clips/hooks/useExportController.ts
 * Description: The one hook the Export panel calls. It joins the queries, state, effects and
 *   mutations into what the screen shows: the Making row, the finished row with its Undo ring,
 *   and the waiting rows.
 */
import { useCopyListSource } from "../../../modules/layout/hooks/copyListStore";
import { exportListText, listFileName, singleClipText, transcriptFor, type ListClip } from "../../../shared/utils/clipListText";
import type { BankedClip } from "../../../shared/utils/bank";
import { validateClipName } from "../utils/clipName";
import { suggestProjectName } from "../utils/projectName";
import { useMakingClipId, useMakingName } from "../../../shared/utils/clipNameStore";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { isRetryingNote } from "../utils/clipFailure";
import { UNDO_SECONDS } from "../utils/exportRows";
import { useYouTubeConnection } from "../../../shared/utils/youtubeConnection";
import { useExportEffects, useFolderResume, useOfflineResume, useRetryKey, useSignInRetry } from "./useExportEffects";
import { useExportMutations } from "./useExportMutations";
import { useExportQueries } from "./useExportQueries";
import { useExportState } from "./useExportState";
import { useHandoffNotice } from "./useHandoffNotice";

export function useExportController() {
  const queries = useExportQueries();
  const state = useExportState();
  useExportEffects(queries, state);
  const actions = useExportMutations(queries, state);
  const handoff = useHandoffNotice(queries.campaignId);
  const makingName = useMakingName();
  const makingId = useMakingClipId();
  useRetryKey(Boolean(state.failed), actions.retry);
  useOfflineResume(Boolean(state.offline), actions.resume);
  const connected = useYouTubeConnection().connected;
  const kind = state.failed?.kind;
  useFolderResume(kind === "drivegone", actions.folder ?? "", actions.retry);
  useSignInRetry(kind === "age" || kind === "members" || kind === "signin" || kind === "expired", connected, actions.retry);
  const { downloading, downloadProgress, downloadPhase, downloads, failure, downloadNote } = useClipperContext();

  // Each clip just made, with its own file and its own Undo seconds.
  const finished = state.finished.map((f) => {
    const entry = downloads.find((d) => d.id === f.entryId);
    return { entryId: f.entryId, name: f.name, secondsLeft: Math.max(0, Math.min(UNDO_SECONDS, (f.endsAt - Math.max(state.now, Date.now())) / 1000)), entry, canShow: Boolean(entry?.path) };
  });

  // A moment that is being made, failed, or just finished has its own row on top; it leaves the list
  // below until that row goes (as on the Making, Failed and Undo boards).
  const onTop = new Set<string>();
  if (downloading && makingId) onTop.add(makingId);
  if (state.failed?.bankId && !downloading) onTop.add(state.failed.bankId);
  if (state.offline?.bankId && !downloading) onTop.add(state.offline.bankId);
  for (const f of finished) if (f.entry?.clipId) onTop.add(f.entry.clipId);
  const waiting = queries.waiting.filter((c) => !onTop.has(c.id));
  const made = queries.made.filter((c) => !onTop.has(c.id));

  // The ··· menu's Copy as text and Save as .txt: the clips waiting in this video, as the list shows them.
  const { info, getTranscript } = useClipperContext();
  const nameOf = (c: BankedClip) => (validateClipName(c.label).ok ? c.label.trim() : suggestProjectName(c)) || c.id;
  // Each clip with the words said in its range (fetched now if the transcript isn't loaded yet).
  const listClips = async (clips: BankedClip[]): Promise<ListClip[]> => {
    const got = await getTranscript();
    return clips.map((c) => ({ name: nameOf(c), segments: c.segments, transcript: transcriptFor(got, c.segments) }));
  };
  useCopyListSource("export", {
    count: waiting.length,
    emptyNote: "Nothing to copy yet. Clips you add show up here.",
    text: async () => exportListText({ videoId: queries.vid || undefined, title: info?.title, clips: await listClips(waiting) }),
    fileName: () => listFileName(info?.title, "Clipr clips"),
  });

  /** The row's Copy: just this clip, its line and its transcript range. */
  const copyClip = async (clip: BankedClip): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(singleClipText((await listClips([clip]))[0], queries.vid || undefined));
      return true;
    } catch {
      return false;
    }
  };

  return {
    ...queries,
    copyClip,
    waiting,
    made,
    ...actions,
    ...handoff,
    cancel: actions.stop,
    selectedId: state.selectedId,
    // A failed clip has its own row; the generic "was not made" line would say it twice.
    notice: (state.failed || state.offline) && !downloading ? "" : state.notice,
    making: downloading
      ? { name: makingName ?? "New clip", percent: downloadProgress, phase: downloadPhase, retrying: isRetryingNote(downloadNote) }
      : null,
    finished,
    failed: state.failed && !downloading ? state.failed : null,
    offline: state.offline && !downloading ? state.offline : null,
    failure,
    signedIn: connected,
  };
}
