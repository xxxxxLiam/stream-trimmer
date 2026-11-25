/**
 * File: useExportController.ts
 * Path: src/renderer/src/features/clips/hooks/useExportController.ts
 * Description: The one hook the Export panel calls. It joins the queries, state, effects and
 *   mutations into what the screen shows: the Making row, the finished row with its Undo ring,
 *   and the waiting rows.
 */
import { useMakingClipId, useMakingName } from "../../../shared/utils/clipNameStore";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { isRetryingNote } from "../utils/clipFailure";
import { useExportEffects, useRetryKey } from "./useExportEffects";
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
  const { downloading, downloadProgress, downloadPhase, downloads, failure, downloadNote } = useClipperContext();

  // Each clip just made, with its own file and its own Undo seconds.
  const finished = state.finished.map((f) => {
    const entry = downloads.find((d) => d.id === f.entryId);
    return { entryId: f.entryId, name: f.name, secondsLeft: Math.max(0, (f.endsAt - state.now) / 1000), entry, canShow: Boolean(entry?.path) };
  });

  // A moment that is being made, failed, or just finished has its own row on top; it leaves the list
  // below until that row goes (as on the Making, Failed and Undo boards).
  const onTop = new Set<string>();
  if (downloading && makingId) onTop.add(makingId);
  if (state.failed?.bankId && !downloading) onTop.add(state.failed.bankId);
  for (const f of finished) if (f.entry?.clipId) onTop.add(f.entry.clipId);
  const waiting = queries.waiting.filter((c) => !onTop.has(c.id));
  const made = queries.made.filter((c) => !onTop.has(c.id));

  return {
    ...queries,
    waiting,
    made,
    ...actions,
    ...handoff,
    cancel: actions.stop,
    selectedId: state.selectedId,
    // A failed clip has its own row; the generic "was not made" line would say it twice.
    notice: state.failed && !downloading ? "" : state.notice,
    making: downloading
      ? { name: makingName ?? "New clip", percent: downloadProgress, phase: downloadPhase, retrying: isRetryingNote(downloadNote) }
      : null,
    finished,
    failed: state.failed && !downloading ? state.failed : null,
    failure,
  };
}
