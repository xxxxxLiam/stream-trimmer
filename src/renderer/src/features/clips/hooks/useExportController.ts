/**
 * File: useExportController.ts
 * Path: src/renderer/src/features/clips/hooks/useExportController.ts
 * Description: The one hook the Export panel calls. It joins the queries, state, effects and
 *   mutations into what the screen shows: the Making row, the finished row with its Undo ring,
 *   and the waiting rows.
 */
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
  useRetryKey(Boolean(state.failed), actions.retry);
  const { downloading, downloadProgress, downloadPhase, downloads, failure, downloadNote } = useClipperContext();

  const finishedEntry = state.finished ? downloads.find((d) => d.id === state.finished?.entryId) : undefined;

  // A moment that is being made, failed, or just finished has its own row on top; it leaves the list
  // below until that row goes (as on the Making, Failed and Undo boards).
  const onTop = new Set<string>();
  if (downloading && state.makingId) onTop.add(state.makingId);
  if (state.failed?.bankId && !downloading) onTop.add(state.failed.bankId);
  if (state.finished && !downloading && finishedEntry?.clipId) onTop.add(finishedEntry.clipId);
  const waiting = queries.waiting.filter((c) => !onTop.has(c.id));
  const made = queries.made.filter((c) => !onTop.has(c.id));

  return {
    ...queries,
    waiting,
    made,
    ...actions,
    ...handoff,
    selectedId: state.selectedId,
    notice: state.notice,
    making: downloading
      ? { name: state.makingName, percent: downloadProgress, phase: downloadPhase, retrying: isRetryingNote(downloadNote) }
      : null,
    finished: state.finished && !downloading ? { name: state.finished.name, secondsLeft: state.secondsLeft } : null,
    finishedEntry,
    failed: state.failed && !downloading ? state.failed : null,
    failure,
    canShowFinished: Boolean(finishedEntry?.path),
  };
}
