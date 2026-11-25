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
import type { ExportState } from "./useExportState";
import type { useExportQueries } from "./useExportQueries";

export function useExportEffects(q: ReturnType<typeof useExportQueries>, s: ExportState) {
  const seg = useSegmentsState();
  const { downloading, downloadPhase, error, failure } = useClipperContext();
  const { setSelectedId, setNotice, setFinished, setSecondsLeft } = s;

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
          setFinished({ entryId: newest.id, name: clipTitle(first.label), endsAt: Date.now() + UNDO_SECONDS * 1000 });
          setSecondsLeft(UNDO_SECONDS);
        }
        s.setFailed(null);
        s.failCount.current = { key: "", count: 0 };
        s.attempt.current = null;
        setCutAttempt(null);
        // The next clip is "New clip" until a waiting moment names it.
        s.setMakingName("New clip");
      } else if (downloadPhase === "error" && error) {
        // The cut that ran last: the marks were cleared when Clip was pressed, so its range is kept here.
        const a = getCutAttempt() ?? s.attempt.current ?? { name: "New clip", segments: seg.segments.map((x) => ({ start: x.start, end: x.end })) };
        const key = JSON.stringify(a.segments);
        s.failCount.current = { key, count: s.failCount.current.key === key ? s.failCount.current.count + 1 : 1 };
        const fromRow = failure?.row ? rowFailure(failure.row) : null;
        const classified = classifyClipFailure(failure?.code, failure?.message ?? error);
        s.setFailed({
          ...a,
          // The engine's row decides, except that a network cause is named as such (no YouTube error).
          kind: classified === "offline" ? "offline" : (fromRow?.kind ?? classified),
          attempts: fromRow?.attempts ?? s.failCount.current.count,
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

  // The Undo drains until its end time; the row keeps its size when it ends.
  const endsAt = s.finished?.endsAt ?? null;
  useEffect(() => {
    if (endsAt === null) return;
    const tick = () => {
      const left = (endsAt - Date.now()) / 1000;
      if (left <= 0) setFinished(null);
      else setSecondsLeft(left);
    };
    tick();
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [endsAt, setFinished, setSecondsLeft]);
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
