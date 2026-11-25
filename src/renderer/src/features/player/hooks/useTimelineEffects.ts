/**
 * File: useTimelineEffects.ts
 * Path: src/renderer/src/features/player/hooks/useTimelineEffects.ts
 * Description: The timeline's listeners: M drops a flag, Fit frames the range, the zoom window
 *   follows the playhead when it leaves, the preview scrubber is told the zoomed part, and the
 *   fold and the scissors reset when they no longer apply.
 */
import { useEffect, useRef } from "react";
import { useIsTabActive } from "../../workspace/hooks/WorkspaceContext";
import { setTool, setZoom, toolForKey, type TimelineTool } from "../../../modules/layout/hooks/useToolState";
import type { Range } from "../../../shared/utils/segments";
import { fitWindow, zoomForSpan, type Win } from "../utils/timelineAxis";
import { dialogOpen } from "../../../shared/utils/dialogOpen";
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
  /** The room kept after the video's end, as a share of the lane. */
  padFrac: number;
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
  /** A scrub is in progress: the window holds still under the pointer. */
  scrubbing: boolean;
};

export function useTimelineEffects(a: Args) {
  const tabActive = useIsTabActive();

  // M drops a flag at the playhead, and only that.
  useEffect(() => {
    if (!tabActive || !a.videoId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || (e.key !== "m" && e.key !== "M") || dialogOpen()) return;
      const el = e.target as HTMLElement | null;
      if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      e.preventDefault();
      a.addFlag(a.playhead);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive, a.videoId, a.playhead]);

  // A, B, D, F, H, Z pick the tool (never while typing, never with a modifier).
  useEffect(() => {
    if (!tabActive) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      const t = toolForKey(e);
      if (!t || dialogOpen()) return;
      e.preventDefault();
      setTool(t);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabActive]);

  // Zooming back out clears the centre. Declared before Fit's effect on purpose: Fit resets the zoom to 0
  // and re-centres in the same commit, so its setFocus must run last and win.
  useEffect(() => {
    if (a.zoom <= 0) a.setFocus(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.zoom]);

  const fitSeen = useRef(a.fitRequests);
  // Fit: frame the picked range with room either side (the whole video when nothing is picked).
  useEffect(() => {
    // Only a press that happens while this is mounted: a remount sees the old count and must not refit.
    if (a.fitRequests === fitSeen.current) return;
    fitSeen.current = a.fitRequests;
    if (!tabActive) return; // every open tab has a timeline; only the one on screen answers
    const w = fitWindow(a.range, a.duration);
    setZoom(zoomForSpan(a.duration, w.end - w.start, a.padFrac));
    a.setFocus((w.start + w.end) / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.fitRequests]);

  // A range that arrives from elsewhere (a banked moment, an import, a restored session) frames the
  // timeline on itself, with the playhead inside it. A range marked by hand never moves the ruler.
  useEffect(() => {
    const r = a.framed;
    if (!tabActive || !r || !(a.duration > 0) || !arrivedFromElsewhere()) return;
    const w = fitWindow(r, a.duration);
    setZoom(zoomForSpan(a.duration, w.end - w.start, a.padFrac));
    a.setFocus((w.start + w.end) / 2);
    if (a.playhead < r.start || a.playhead > r.end) a.seek(r.start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive, a.videoId, a.duration, a.framed?.start, a.framed?.end]);

  // Zoomed in with no centre of its own (the zoom came from the slider, the + and - buttons or a key), the
  // view keeps the centre it has now. Without one it re-centred on the playhead on every move, so a scrub
  // chased its own tail and every click slid the ruler.
  useEffect(() => {
    if (a.zoom > 0 && a.focus === null) a.setFocus(a.win.start + (a.win.end - a.win.start) / 2);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [a.zoom, a.focus]);

  // Zoomed in, the window follows the playhead once it runs off the edge. Only when the playhead
  // moves: zooming or panning to look somewhere else must not snap the view back to it.
  useEffect(() => {
    if (a.zoom <= 0 || a.scrubbing) return; // a scrub never moves the axis under the pointer
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
