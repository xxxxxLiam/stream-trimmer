/**
 * File: useTimelineEffects.ts
 * Path: src/renderer/src/features/player/hooks/useTimelineEffects.ts
 * Description: The timeline's listeners: M drops a flag, Fit frames the range, the zoom window
 *   follows the playhead when it leaves, the preview scrubber is told the zoomed part, and the
 *   fold and the scissors reset when they no longer apply.
 */
import { useEffect, useRef } from "react";
import { useIsTabActive } from "../../workspace/hooks/WorkspaceContext";
import { setZoom, type TimelineTool } from "../../../modules/layout/hooks/useToolState";
import type { Range } from "../../../shared/utils/segments";
import { fitWindow, zoomForSpan, type Win } from "../utils/timelineAxis";
import { arrivedFromElsewhere } from "../utils/rangeOrigin";
import { publishTimelineView } from "./useTimelineView";

type Args = {
  /** The one section being worked on (picked or banked), or null for none or several. */
  framed: Range | null;
  seek: (t: number) => void;
  range: Range | null;
  duration: number;
  playhead: number;
  zoom: number;
  fitRequests: number;
  focus: number | null;
  setFocus: (t: number | null) => void;
  win: Win;
  videoId: string | null;
  addFlag: (t: number) => void;
  joined: boolean;
  setFoldOpen: (v: boolean) => void;
  tool: TimelineTool;
  setScissorsStart: (t: number | null) => void;
  view: Win | null;
};

export function useTimelineEffects(a: Args) {
  const tabActive = useIsTabActive();

  // M drops a flag at the playhead, and only that.
  useEffect(() => {
    if (!tabActive || !a.videoId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== "m" && e.key !== "M")) return;
      const el = e.target as HTMLElement | null;
      if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      a.addFlag(a.playhead);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive, a.videoId, a.playhead]);

  const fitSeen = useRef(a.fitRequests);
  // Fit: frame the picked range with room either side (the whole video when nothing is picked).
  useEffect(() => {
    // Only a press that happens while this is mounted: a remount sees the old count and must not refit.
    if (a.fitRequests === fitSeen.current) return;
    fitSeen.current = a.fitRequests;
    if (!tabActive) return; // every open tab has a timeline; only the one on screen answers
    const w = fitWindow(a.range, a.duration);
    setZoom(zoomForSpan(a.duration, w.end - w.start));
    a.setFocus((w.start + w.end) / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.fitRequests]);

  // A range that arrives from elsewhere (a banked moment, an import, a restored session) frames the
  // timeline on itself, with the playhead inside it. A range marked by hand never moves the ruler.
  useEffect(() => {
    const r = a.framed;
    if (!tabActive || !r || !(a.duration > 0) || !arrivedFromElsewhere()) return;
    const w = fitWindow(r, a.duration);
    setZoom(zoomForSpan(a.duration, w.end - w.start));
    a.setFocus((w.start + w.end) / 2);
    if (a.playhead < r.start || a.playhead > r.end) a.seek(r.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive, a.videoId, a.duration, a.framed?.start, a.framed?.end]);

  // Zooming back out clears the centre.
  useEffect(() => {
    if (a.zoom === 0) a.setFocus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.zoom]);

  // Zoomed in, the window follows the playhead once it runs off the edge. Only when the playhead
  // moves: zooming or panning to look somewhere else must not snap the view back to it.
  useEffect(() => {
    if (a.zoom === 0) return;
    if (a.playhead < a.win.start || a.playhead > a.win.end) a.setFocus(a.playhead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.playhead]);

  useEffect(() => {
    publishTimelineView(a.view);
    return () => publishTimelineView(null);
  }, [a.view?.start, a.view?.end]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!a.joined) a.setFoldOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.joined]);

  useEffect(() => {
    if (a.tool !== "clip") a.setScissorsStart(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.tool]);
}
