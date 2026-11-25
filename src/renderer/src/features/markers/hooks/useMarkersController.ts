/**
 * File: useMarkersController.ts
 * Path: src/renderer/src/features/markers/hooks/useMarkersController.ts
 * Description: Everything the Markers panel needs: the flags grouped for the list, Trim next flag
 *   (30 seconds around it, set as the In and Out), Join (one clip from the ranged flags), the
 *   N key, and folding a flag into Clipped once its clip has finished.
 */
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { usePanelHost } from "../../../modules/layout/hooks/PanelHostContext";
import { useFlagsState } from "../../../shared/hooks/useFlagsState";
import { formatTimestamp, parseTimestamp } from "../../../shared/utils/clip";
import { groupFlags, nextOpenFlag, trimWindow, type FlagRow } from "../utils/markers";
import { markerMemory } from "../utils/markerMemory";

export function useMarkersController() {
  const clipper = useClipperContext();
  const { playhead, cutSegments } = usePanelHost();
  const { videoId, transcript, duration, startText, endText, downloading, error } = clipper;
  const { flags, removeFlag } = useFlagsState(videoId);
  useSyncExternalStore(markerMemory.subscribe, markerMemory.get, markerMemory.get);
  const mem = markerMemory.for(videoId);

  const groups = useMemo(() => groupFlags(flags, mem, transcript ?? []), [flags, mem, transcript]);
  const next = nextOpenFlag(groups, playhead);

  // The flag being trimmed follows the In and Out boxes.
  const [activeAt, setActiveAt] = useState<number | null>(null);
  useEffect(() => {
    if (activeAt == null || !videoId) return;
    const s = parseTimestamp(startText);
    const e = parseTimestamp(endText);
    if (s != null && e != null && e > s) markerMemory.trim(videoId, activeAt, { start: s, end: e });
  }, [activeAt, startText, endText, videoId]);

  const setRangeBoxes = useCallback(
    (start: number, end: number) => {
      clipper.setStartText(formatTimestamp(Math.floor(start)));
      clipper.setEndText(formatTimestamp(Math.ceil(end)));
    },
    [clipper],
  );

  const trimNext = useCallback(() => {
    if (!next || !videoId) return;
    const w = trimWindow(next.at, duration || null);
    setRangeBoxes(w.start, w.end);
    markerMemory.trim(videoId, next.at, w);
    setActiveAt(next.at);
    clipper.requestSeek(w.start);
  }, [next, videoId, duration, setRangeBoxes, clipper]);

  const open = useCallback(
    (row: FlagRow) => {
      if (row.range) {
        setRangeBoxes(row.range.start, row.range.end);
        setActiveAt(row.at);
        clipper.requestSeek(row.range.start);
      } else clipper.requestSeek(row.at);
    },
    [setRangeBoxes, clipper],
  );

  // Flags go to Clipped once the clip that used them has finished without an error.
  const pending = useRef<number[]>([]);
  const wasDownloading = useRef(false);
  useEffect(() => {
    if (downloading && !wasDownloading.current && pending.current.length === 0 && activeAt != null) {
      pending.current = [activeAt];
    }
    if (!downloading && wasDownloading.current) {
      if (!error && videoId) for (const at of pending.current) markerMemory.clip(videoId, at);
      pending.current = [];
      setActiveAt(null);
    }
    wasDownloading.current = downloading;
  }, [downloading, error, activeAt, videoId]);

  const join = useCallback(() => {
    const rows = groups.ranged;
    if (rows.length < 2) return;
    pending.current = rows.map((r) => r.at);
    cutSegments(rows.map((r) => ({ start: r.range!.start, end: r.range!.end })));
  }, [groups.ranged, cutSegments]);

  // N trims the next flag, unless the user is typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      trimNext();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [trimNext]);

  /** Remove a flag. The range it was trimmed to stays in the memory and in the In and Out boxes (B-9). */
  const remove = useCallback((row: FlagRow) => removeFlag(row.at), [removeFlag]);

  const [clippedOpen, setClippedOpen] = useState(false);

  return {
    groups,
    empty: flags.length === 0,
    canTrim: next !== null,
    trimNext,
    open,
    remove,
    join,
    clippedOpen,
    toggleClipped: () => setClippedOpen((v) => !v),
  };
}
