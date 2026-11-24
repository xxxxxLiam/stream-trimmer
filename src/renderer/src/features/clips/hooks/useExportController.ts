/**
 * File: useExportController.ts
 * Path: src/renderer/src/features/clips/hooks/useExportController.ts
 * Description: The one hook the Export panel calls. It joins the queries, state, effects and
 *   mutations into what the screen shows: the Making row, the finished row with its Undo ring,
 *   and the waiting rows.
 */
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useExportEffects } from "./useExportEffects";
import { useExportMutations } from "./useExportMutations";
import { useExportQueries } from "./useExportQueries";
import { useExportState } from "./useExportState";

export function useExportController() {
  const queries = useExportQueries();
  const state = useExportState();
  useExportEffects(queries, state);
  const actions = useExportMutations(queries, state);
  const { downloading, downloadProgress, downloadPhase, downloads } = useClipperContext();

  const finishedEntry = state.finished ? downloads.find((d) => d.id === state.finished?.entryId) : undefined;

  return {
    ...queries,
    ...actions,
    selectedId: state.selectedId,
    notice: state.notice,
    importing: state.importing,
    setImporting: state.setImporting,
    making: downloading ? { name: state.makingName, percent: downloadProgress, phase: downloadPhase } : null,
    finished: state.finished && !downloading ? { name: state.finished.name, secondsLeft: state.secondsLeft } : null,
    finishedEntry,
    canShowFinished: Boolean(finishedEntry?.path),
  };
}
