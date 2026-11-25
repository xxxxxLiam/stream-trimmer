/**
 * File: useTimelineController.ts
 * Path: src/renderer/src/features/player/hooks/useTimelineController.ts
 * Description: The only hook the timeline components call. Joins the video's range and sections, the
 *   shared tools (pointer, scissors, flag, hand, zoom), the zoom window or the fold, and the lanes'
 *   data into one view model with its pointer handlers.
 */
import { useSuggestedName } from "./useSuggestedName";
import { useEffect, useMemo, useRef, type PointerEvent } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { useFlagsState } from "../../../shared/hooks/useFlagsState";
import { getZoom, useToolState } from "../../../modules/layout/hooks/useToolState";
import { useAudioLanguageState } from "../../../modules/layout/hooks/useAudioLanguageState";
import { audioLanesOf } from "../../../shared/utils/audioLanguages";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import type { NamedRange } from "../../../shared/utils/segments";
import { clipSections, sectionsLength } from "../utils/clipDestination";
import { clampX, grabbedEdge, scissorsClick, wheelAction, zoomStep } from "../utils/laneTools";
import { snapToWord } from "../utils/snap";
import { axisDuringDrag, axisTicks, focusForAnchor, foldedAxis, linearAxis, toT, toX, windowFor, type Axis, type Fold } from "../utils/timelineAxis";
import { clockTime } from "../utils/transport";
import { usePickedRange } from "./usePickedRange";
import { useTimelineState } from "./useTimelineState";
import { markByHand } from "../utils/rangeOrigin";
import { useTimelineEffects } from "./useTimelineEffects";

export const DRAG_START_PX = 3;
const dash = "—";

export function useTimelineController() {
  const clipper = useClipperContext();
  const store = useSegmentsState();
  const tools = useToolState();
  const { active } = useCampaign();
  const range = usePickedRange();
  const [audioSel] = useAudioLanguageState(active?.id ?? null);
  const audioLanes = useMemo(() => audioLanesOf(clipper.info?.audioTracks, audioSel), [clipper.info?.audioTracks, audioSel]);
  const flagsApi = useFlagsState(clipper.videoId);
  const s = useTimelineState();
  const { duration, videoId } = clipper;
  const playhead = store.playhead;
  const lines = clipper.transcript;

  // The Transcript lane needs the words; load them once for this video.
  const { ensureTranscript } = clipper;
  useEffect(() => {
    if (videoId) ensureTranscript();
  }, [videoId, ensureTranscript]);

  const sections = useMemo(
    () => clipSections(store.segments, range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [store.segments, range?.start, range?.end],
  );
  const startPicked = clipper.startText.trim() !== "" && Number.isFinite(clipper.start) && clipper.start >= 0 && !range;
  const joined = sections.length >= 2;
  const existingNames = useMemo(
    () => [...(videoId && active ? (active.usedRanges[videoId] ?? []) : []), ...store.banked].map((r) => (r as { label?: string }).label ?? "").filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videoId, active, store.banked],
  );
  const suggestedName = useSuggestedName(videoId, clipper.info?.title ?? "", lines, sections, existingNames);
  const total = sectionsLength(sections);

  const win = windowFor(duration, tools.zoom, s.focus ?? playhead);
  const liveFold = joined && !s.foldOpen ? foldedAxis(sections, duration, s.width) : null;
  const live = { axis: (liveFold ? liveFold.axis : linearAxis(win, s.width)) as Axis, fold: liveFold?.fold ?? ([] as Fold[]), folded: !!liveFold };
  // The axis the pointer went down on stays for the whole drag: the drag itself creates a range, which
  // would fold the timeline under the pointer. It folds after pointer-up.
  const frozen = useRef<typeof live | null>(null);
  if (!s.drag || s.drag.kind === "pan") frozen.current = null;
  const shown = axisDuringDrag(frozen.current, live);
  const axis = shown.axis;
  const folded = shown.folded;
  const view = tools.zoom > 0 && !folded ? win : null;
  const ticks = axisTicks(axis);

  const used: readonly NamedRange[] = videoId && active ? (active.usedRanges[videoId] ?? []) : [];
  const waiting = store.banked;

  useTimelineEffects({
    framed: sections.length === 1 ? sections[0] : null,
    seek: (t: number) => clipper.requestSeek(t),
    range,
    duration,
    playhead,
    zoom: tools.zoom,
    fitRequests: tools.fitRequests,
    focus: s.focus,
    setFocus: s.setFocus,
    win,
    videoId,
    addFlag: flagsApi.addFlag,
    joined,
    setFoldOpen: s.setFoldOpen,
    tool: tools.tool,
    setScissorsStart: s.setScissorsStart,
    view,
    scrubbing: s.drag?.kind === "scrub",
  });

  // The handlers sit on the whole timeline area (so a tool works in any part of it, including the
  // space under the tracks); the lanes start after the label column, so x is measured from the right.
  const laneLeft = (e: PointerEvent<HTMLElement>) => e.currentTarget.getBoundingClientRect().right - s.width;
  const timeAt = (e: PointerEvent<HTMLElement>): number | null => toT(axis, e.clientX - laneLeft(e));
  const snap = (t: number, edge: "start" | "end") => Math.round(snapToWord(lines, t, edge));

  const setRange = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo < 1) return;
    markByHand();
    clipper.setStartFromSeconds(snap(lo, "start"));
    clipper.setEndFromSeconds(snap(hi, "end"));
  };

  /** Zoom to `zoom` keeping time `t`, at lane position `x`, under the same spot (a pinch or click zooms into the point). */
  const zoomAt = (x: number, t: number, zoom: number) => {
    const next = Math.min(100, Math.max(0, zoom));
    if (!folded && s.width > 0) s.setFocus(focusForAnchor(duration, next, t, x / s.width));
    else s.setFocus(t);
    tools.setZoom(next);
  };

  /** Pointer down on the Source lane. What it does depends on the tool. */
  const onLanePointerDown = (e: PointerEvent<HTMLElement>) => {
    // Buttons and fields inside the area (a clip label, the fold, the name box) keep their own clicks.
    if ((e.target as HTMLElement).closest("button, input, textarea, [contenteditable='true']")) return;
    const x = e.clientX - laneLeft(e);
    if (x < 0 || x > s.width) return; // the label column is not the timeline
    const t = timeAt(e);
    if (t === null || !(duration > 0)) return;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    if (tools.tool === "flag") return flagsApi.addFlag(t);
    if (tools.tool === "zoom") return zoomAt(x, t, getZoom() + zoomStep(e.altKey));
    if (tools.tool === "hand") return s.setDrag({ kind: "pan", startX: e.clientX, startFocus: s.focus ?? playhead });
    if (tools.tool === "clip") {
      // Scissors only mark: a first click is the start, the second is the end. They never seek.
      const step = scissorsClick(s.scissorsStart, t);
      if (step.kind === "start") {
        s.setScissorsStart(step.at);
        markByHand();
        clipper.setStartFromSeconds(snap(step.at, "start"));
        clipper.setEndText("");
      } else {
        setRange(step.start, step.end);
        s.setScissorsStart(null);
      }
      return;
    }
    if (tools.tool === "range") {
      // Select range: press and drag sets a range; a grabbed edge of the picked range resizes it.
      if (range) {
        const edge = grabbedEdge(x, toX(axis, range.start), toX(axis, range.end));
        if (edge) {
          frozen.current = shown;
          return s.setDrag({ kind: "edge", edge });
        }
      }
      frozen.current = shown;
      s.setDrag({ kind: "range", anchor: t });
      s.setDragOrigin(e.clientX);
      return;
    }
    // The pointer only moves the playhead: a click goes there, a drag scrubs along the video.
    s.setDrag({ kind: "scrub" });
    clipper.requestSeek(Math.round(t));
  };

  const lastScrub = useRef<number | null>(null);
  const onLanePointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = s.drag;
    if (!d || e.buttons !== 1) return;
    if (d.kind === "pan") {
      const per = (win.end - win.start) / Math.max(1, s.width);
      s.setFocus(Math.min(duration, Math.max(0, d.startFocus - (e.clientX - d.startX) * per)));
      return;
    }
    if (d.kind === "scrub") {
      const at = toT(axis, clampX(e.clientX - laneLeft(e), s.width));
      if (at !== null) {
        const sec = Math.round(Math.min(Math.max(0, at), duration));
        if (sec !== lastScrub.current) {
          lastScrub.current = sec;
          clipper.requestSeek(sec);
        }
      }
      return;
    }
    const t = timeAt(e);
    if (t === null) return;
    if (d.kind === "edge" && range) {
      if (d.edge === "start") setRange(t, range.end);
      else setRange(range.start, t);
    } else if (d.kind === "range" && Math.abs(e.clientX - s.dragOrigin) >= DRAG_START_PX) {
      setRange(d.anchor, t);
    }
  };

  const onLanePointerUp = () => {
    const d = s.drag;
    s.setDrag(null);
    lastScrub.current = null;
    // A range drag that never moved sets nothing; one that moved already made the range.
    if (d?.kind === "range") s.setScissorsStart(null);
  };

  /** Wheel and trackpad over the lane: pan sideways, Ctrl/Cmd zooms around the pointer. Returns true when used. */
  const onLaneWheel = (e: WheelEvent, left: number): boolean => {
    const act = wheelAction(e);
    if (!act || !(duration > 0)) return false;
    if (act.kind === "pan") {
      const per = (win.end - win.start) / Math.max(1, s.width);
      s.setFocus(Math.min(duration, Math.max(0, (s.focus ?? (win.start + win.end) / 2) + act.pixels * per)));
    } else {
      const x = e.clientX - left;
      const at = toT(axis, x);
      if (at !== null) zoomAt(x, at, getZoom() + act.amount);
      else tools.zoomBy(act.amount);
    }
    return true;
  };

  const addSection = () => {
    if (!range) return;
    const r = store.add(range, { duration: duration || undefined });
    if (r.ok) {
      clipper.setStartText("");
      clipper.setEndText("");
    }
  };

  return {
    videoId,
    duration,
    playhead,
    range,
    sections,
    audioLanes,
    suggestedName,
    joined,
    total,
    segments: store.segments,
    locked: store.locked,
    tool: tools.tool,
    zoom: tools.zoom,
    axis,
    fold: shown.fold,
    folded,
    openFold: () => s.setFoldOpen(true),
    ticks,
    view,
    width: s.width,
    setWidth: s.setWidth,
    storyboards: clipper.info?.storyboards,
    lines,
    transcriptLoading: clipper.loadingTranscript,
    flags: flagsApi.flags,
    used,
    waiting,
    scissorsStart: s.scissorsStart,
    opening: !!videoId && !clipper.info && clipper.loadingInfo,
    firstClipHint: !!clipper.info && !startPicked && !range && store.segments.length === 0 && used.length === 0,
    startPicked,
    start: clipper.start,
    inText: range ? clockTime(range.start) : startPicked ? clockTime(clipper.start) : dash,
    outText: range ? clockTime(range.end) : dash,
    lengthText: total > 0 ? lengthLabel(total) : dash,
    /** The whole joined clip in seconds, for the campaign's length rule. */
    totalSeconds: total,
    onLanePointerDown,
    onLanePointerMove,
    onLanePointerUp,
    onLaneWheel,
    addSection,
    removeSection: (i: number) => store.remove(i),
    seek: (t: number) => clipper.requestSeek(t),
  };
}

/** The clip length as the board writes it: 0:42 (minutes and seconds), hours only when needed. */
export function lengthLabel(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${sec}` : `${m}:${sec}`;
}

export type TimelineController = ReturnType<typeof useTimelineController>;
