/**
 * File: useTimelineEffects.ts
 * Path: src/renderer/src/features/player/hooks/useTimelineEffects.ts
 * Description: The timeline's listeners: M drops a flag, Fit frames the range, the zoom window
 *   follows the playhead when it leaves, the preview scrubber is told the zoomed part, and the
 *   fold and the scissors reset when they no longer apply.
 */
import { useEffect } from "react";
import { useIsTabActive } from "../../workspace/hooks/WorkspaceContext";
import { setZoom, type TimelineTool } from "../../../modules/layout/hooks/useToolState";
import type { Range } from "../../../shared/utils/segments";
import { fitWindow, zoomForSpan, type Win } from "../utils/timelineAxis";
import { publishTimelineView } from "./useTimelineView";

type Args = {
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

  // Fit: frame the picked range with room either side (the whole video when nothing is picked).
  useEffect(() => {
    if (a.fitRequests === 0) return;
    const w = fitWindow(a.range, a.duration);
    setZoom(zoomForSpan(a.duration, w.end - w.start));
    a.setFocus((w.start + w.end) / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.fitRequests]);

  // Zoomed in, the window follows the playhead once it runs off the edge.
  useEffect(() => {
    if (a.zoom === 0) {
      a.setFocus(null);
      return;
    }
    if (a.playhead < a.win.start || a.playhead > a.win.end) a.setFocus(a.playhead);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.zoom, a.playhead]);

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
