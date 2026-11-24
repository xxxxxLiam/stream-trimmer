/**
 * File: useHistoryController.ts
 * Path: src/renderer/src/features/downloads/hooks/useHistoryController.ts
 * Description: The one hook the History panel calls: search pills, the grouped rows, and the three
 *   row actions (Jump to source, Show in Finder, In editor).
 */
import { useCallback, useState } from "react";
import { useEntryActions } from "../../../shared/hooks/useEntryActions";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { playFrom } from "../../../shared/utils/playFrom";
import type { DownloadEntry } from "../../../shared/utils/downloads";
import { useHistoryCache } from "./useHistoryCache";
import { useHistoryQueries } from "./useHistoryQueries";

export function useHistoryController() {
  const [pills, setPills] = useState<string[]>([]);
  const queries = useHistoryQueries(pills);
  const { videoId } = useClipperContext();
  const actions = useEntryActions();
  const cache = useHistoryCache(queries.total);

  /** Only a clip from the open video can jump; its start is where it was cut from. */
  const canJump = useCallback(
    (e: DownloadEntry) => e.startSec !== undefined && e.videoId !== undefined && e.videoId === videoId,
    [videoId],
  );
  const jump = useCallback((e: DownloadEntry) => {
    if (e.startSec !== undefined) playFrom(e.startSec);
  }, []);

  return { pills, setPills, ...queries, cache, canJump, jump, show: actions.show, inEditor: actions.inEditor };
}
