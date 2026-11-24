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

export function useExportController() {
  const queries = useExportQueries();
  const state = useExportState();
  useExportEffects(queries, state);
  const actions = useExportMutations(queries, state);
  useRetryKey(Boolean(state.failed), actions.retry);
  const { downloading, downloadProgress, downloadPhase, downloads, failure, downloadNote } = useClipperContext();

  const finishedEntry = state.finished ? downloads.find((d) => d.id === state.finished?.entryId) : undefined;

  return {
    ...queries,
    ...actions,
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
