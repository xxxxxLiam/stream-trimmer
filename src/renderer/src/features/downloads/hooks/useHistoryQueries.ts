/**
 * File: useHistoryQueries.ts
 * Path: src/renderer/src/features/downloads/hooks/useHistoryQueries.ts
 * Description: What the History panel reads: the saved clips, narrowed by the search pills and
 *   grouped by day, plus which files have since moved or been deleted.
 */
import { useEffect, useMemo, useState } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { countText, filterHistory, groupByDay, historyClips } from "../utils/historyRows";

export function useHistoryQueries(pills: readonly string[]) {
  const { downloads, isElectron } = useClipperContext();
  const clips = useMemo(() => historyClips(downloads), [downloads]);
  const visible = useMemo(() => filterHistory(clips, pills), [clips, pills]);
  const groups = useMemo(() => groupByDay(visible, Date.now()), [visible]);
  const count = pills.length > 0 && visible.length !== clips.length ? `${visible.length} of ${countText(clips.length)}` : countText(clips.length);

  // Files can be moved or deleted outside the app, so probe when the list changes.
  const [missing, setMissing] = useState<Record<string, boolean>>({});
  useEffect(() => {
    const probe = window.electronAPI?.fileExists;
    if (!isElectron || !probe) return;
    let cancelled = false;
    void (async () => {
      const found: Record<string, boolean> = {};
      for (const e of clips) {
        if (!e.path) continue;
        try {
          found[e.id] = !(await probe(e.path));
        } catch {
          found[e.id] = false;
        }
      }
      if (!cancelled) setMissing(found);
    })();
    return () => {
      cancelled = true;
    };
  }, [isElectron, clips]);

  return { total: clips.length, groups, count, missing };
}
