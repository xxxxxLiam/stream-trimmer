/**
 * File: useExportEffects.ts
 * Path: src/renderer/src/features/clips/hooks/useExportEffects.ts
 * Description: The Export panel's listeners and timers: paint the waiting moments on the timeline,
 *   forget the selection on a new video, show the finished clip with its 8 s Undo when a download
 *   completes, and drain the Undo.
 */
import { useEffect, useRef } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { clipTitle, getDownloads } from "../../../shared/utils/downloads";
import { UNDO_SECONDS } from "../utils/exportRows";
import { clipGroup } from "../utils/undoClip";
import { classifyClipFailure, isRetryKey, rowFailure } from "../utils/clipFailure";
import { getCutAttempt, setCutAttempt } from "../../../shared/utils/cutAttempt";
import { withFinished, type ExportState } from "./useExportState";
import type { useExportQueries } from "./useExportQueries";

export function useExportEffects(q: ReturnType<typeof useExportQueries>, s: ExportState) {
  const seg = useSegmentsState();
  const { downloading, downloadPhase, error, failure } = useClipperContext();
  const { setSelectedId, setNotice, setFinished, setNow } = s;

  // New video or campaign: the selection and notices do not carry over.
  useEffect(() => {
    setSelectedId(null);
    setNotice("");
  }, [q.campaignId, q.vid, setSelectedId, setNotice]);

  // Paint the plan on the timeline. syncVideo clears it on a video change, so reapply when it is empty.
  const appliedKey = useRef("");
  useEffect(() => {
    const key = JSON.stringify(q.planned);
    if (appliedKey.current !== key || seg.banked.length !== q.planned.length) {
      appliedKey.current = key;
      // The per-tab setter: a hidden tab must write to its own store, not the active tab's.
      seg.setBanked(q.planned);
    }
  }, [q.planned, seg.banked.length, seg.setBanked, q.vid]);

  // A download that just ended: completed becomes the finished row with Undo; failed becomes the
  // clip's own failure row. A user cancel (phase idle, no error) shows nothing.
  const wasDownloading = useRef(false);
  useEffect(() => {
    if (wasDownloading.current && !downloading) {
      if (downloadPhase === "done") {
        const newest = getDownloads().find((d) => d.kind === "clip");
        if (newest) {
          // The clip's name is its first file's (the original), not the newest language copy's.
          const files = clipGroup(newest, getDownloads());
          const first = files[files.length - 1] ?? newest;
          setFinished((list) => withFinished(list, { entryId: newest.id, name: clipTitle(first.label), endsAt: Date.now() + UNDO_SECONDS * 1000 }));
        }
        s.setFailed(null);
        s.failCount.current = { key: "", count: 0 };
        s.attempt.current = null;
        setCutAttempt(null);
      } else if (downloadPhase === "error" && error) {
        // The cut that ran last: the marks were cleared when Clip was pressed, so its range is kept here.
        const a = getCutAttempt() ?? s.attempt.current ?? { name: "New clip", segments: seg.segments.map((x) => ({ start: x.start, end: x.end })) };
        const key = JSON.stringify(a.segments);
        s.failCount.current = { key, count: s.failCount.current.key === key ? s.failCount.current.count + 1 : 1 };
        const fromRow = failure?.row ? rowFailure(failure.row) : null;
        const classified = classifyClipFailure(failure?.code, failure?.message ?? error);
        s.setFailed({
          ...a,
          // The engine's row decides disk and cannot-download; a plain failure is named by its code.
          kind: classified !== "stopped" ? classified : (fromRow?.kind ?? classified),
          // The row's count and our own: the second failed Retry shows Copy details either way.
          attempts: Math.max(fromRow?.attempts ?? 1, s.failCount.current.count),
          retrying: fromRow?.retrying,
          // A full or unwritable folder says so in the engine's own sentence.
          reason: fromRow?.reason ?? (failure?.code === "disk_full" || failure?.code === "save_folder_gone" ? failure.message : undefined),
          message: error,
          code: failure?.code,
        });
      }
    }
    wasDownloading.current = downloading;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [downloading, downloadPhase]);

  // The Undo windows drain until their own end times; a window that has run out leaves the list.
  const nextEnd = s.finished.reduce<number | null>((m, f) => (m === null ? f.endsAt : Math.min(m, f.endsAt)), null);
  const anyLeft = s.finished.length > 0;
  useEffect(() => {
    if (!anyLeft) return;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      setFinished((list) => (list.some((f) => f.endsAt <= t) ? list.filter((f) => f.endsAt > t) : list));
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [anyLeft, nextEnd, setFinished, setNow]);
}

/** R retries the failed clip on its row. Not while typing, and not with a modifier. */
export function useRetryKey(active: boolean, retry: () => void) {
  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (!isRetryKey(e)) return;
      e.preventDefault();
      retry();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, retry]);
}
