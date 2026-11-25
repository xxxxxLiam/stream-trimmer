/**
 * File: useExportEffects.ts
 * Path: src/renderer/src/features/clips/hooks/useExportEffects.ts
 * Description: The Export panel's listeners and timers: paint the waiting moments on the timeline,
 *   forget the selection on a new video, show the finished clip with its 8 s Undo when a download
 *   completes, and drain the Undo.
 */
import { closeCrashNote } from "../../../shared/utils/crashNoteStore";
import { useEffect, useRef } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { clipTitle, getDownloads } from "../../../shared/utils/downloads";
import { UNDO_SECONDS } from "../utils/exportRows";
import { clipGroup } from "../utils/undoClip";
import { classifyClipFailure, isRetryKey, isWaitingForConnection, rowFailure } from "../utils/clipFailure";
import { getCutAttempt, setCutAttempt } from "../../../shared/utils/cutAttempt";
import { withFinished, type ExportState } from "./useExportState";
import type { useExportQueries } from "./useExportQueries";

export function useExportEffects(q: ReturnType<typeof useExportQueries>, s: ExportState) {
  const seg = useSegmentsState();
  const { downloading, downloadPhase, downloadProgress, error, failure } = useClipperContext();
  // Where the bar stood while it was making, for a row that stops there.
  const lastPercent = useRef(0);
  if (downloading) lastPercent.current = downloadProgress;
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
        s.setOffline(null);
        // A clip made after the crash is proof enough that things work again.
        closeCrashNote();
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
        // The connection went: not a failure to act on. The clip's row says so and it carries on when back,
        // unless it keeps failing while the machine says it is online (then the failure row with Retry is honest).
        if (isWaitingForConnection(classified, s.failCount.current.count, navigator.onLine !== false)) {
          s.setFailed(null);
          s.setOffline({ ...a, percent: lastPercent.current });
          wasDownloading.current = downloading;
          return;
        }
        s.setOffline(null);
        s.setFailed({
          ...a,
          // The engine's row decides disk and cannot-download; a plain failure is named by its code.
          kind: classified !== "stopped" ? classified : (fromRow?.kind ?? classified),
          // The row's count and our own: the second failed Retry shows Copy details either way.
          attempts: Math.max(fromRow?.attempts ?? 1, s.failCount.current.count),
          retrying: fromRow?.retrying,
          final: fromRow?.final,
          room: failure?.room,
          // A full or unwritable folder says so in the engine's own sentence.
          reason: (classified === "offline" || classified === "signin" || classified === "removed" ? undefined : fromRow?.reason) ?? (failure?.code === "disk_full" || failure?.code === "save_folder_gone" ? failure.message : undefined),
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

/** A cut waiting for the connection carries on when it is back (the browser says so, or a quiet check finds it). */
export function useOfflineResume(waiting: boolean, resume: () => void) {
  useEffect(() => {
    if (!waiting) return;
    const go = () => {
      if (navigator.onLine !== false) resume();
    };
    window.addEventListener("online", go);
    const id = window.setInterval(go, 20_000);
    return () => {
      window.removeEventListener("online", go);
      window.clearInterval(id);
    };
  }, [waiting, resume]);
}

/** A "drive not connected" row carries on by itself once the folder can be used again. */
export function useFolderResume(waiting: boolean, dirPath: string, resume: () => void) {
  useEffect(() => {
    if (!waiting || !dirPath) return;
    let live = true;
    const id = window.setInterval(() => {
      void Promise.resolve(window.electronAPI?.checkFolder?.({ dirPath }))
        .then((answer) => live && answer?.ok === true && resume())
        .catch(() => undefined);
    }, 4_000);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [waiting, dirPath, resume]);
}

/** A row that asked for a sign-in tries again by itself the moment one lands. */
export function useSignInRetry(waiting: boolean, connected: boolean, retry: () => void) {
  const was = useRef(connected);
  useEffect(() => {
    if (waiting && connected && !was.current) retry();
    was.current = connected;
  }, [waiting, connected, retry]);
}
