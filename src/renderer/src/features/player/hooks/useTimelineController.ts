/**
 * File: useTimelineController.ts
 * Path: src/renderer/src/features/player/hooks/useTimelineController.ts
 * Description: The only hook the timeline components call. Joins the video's range and sections, the
 *   shared tools (pointer, scissors, flag, hand, zoom), the zoom window or the fold, and the lanes'
 *   data into one view model with its pointer handlers.
 */
import { useSuggestedName } from "./useSuggestedName";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { useFlagsState } from "../../../shared/hooks/useFlagsState";
import { ZOOM_MIN, getZoom, useToolState } from "../../../modules/layout/hooks/useToolState";
import { useAudioLanguageState } from "../../../modules/layout/hooks/useAudioLanguageState";
import { audioLanesOf } from "../../../shared/utils/audioLanguages";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import type { NamedRange } from "../../../shared/utils/segments";
import { clipSections, sectionsLength } from "../utils/clipDestination";
import { clampX, edgeScroll, grabbedEdge, scissorsClick, wheelAction, zoomStep } from "../utils/laneTools";
import { snapToWord } from "../utils/snap";
import { TOUCH_PX, movedRange, pickSection, touching } from "../utils/sectionMove";
import { axisDuringDrag, axisTicks, focusForAnchor, foldedAxis, linearAxis, toT, toX, windowFor, END_PAD_PX, type Axis, type Fold } from "../utils/timelineAxis";
import { clockTime } from "../utils/transport";
import { usePickedRange } from "./usePickedRange";
import { useTimelineState } from "./useTimelineState";
import { markByHand } from "../utils/rangeOrigin";
import { useTimelineEffects } from "./useTimelineEffects";
import { useIsTabActive } from "../../workspace/hooks/WorkspaceContext";
import { dialogOpen } from "../../../shared/utils/dialogOpen";

export const DRAG_START_PX = 3;
/** Pixels of the window a full-speed edge scroll moves every 40 ms tick. */
const EDGE_SCROLL_PX = 14;
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
  // B3-1: an Out set before the In is stored, so the readout shows it instead of a dash.
  const endPicked = clipper.endText.trim() !== "" && Number.isFinite(clipper.end) && clipper.end >= 0 && !range;
  const joined = sections.length >= 2;
  const existingNames = useMemo(
    () => [...(videoId && active ? (active.usedRanges[videoId] ?? []) : []), ...store.banked].map((r) => (r as { label?: string }).label ?? "").filter(Boolean),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [videoId, active, store.banked],
  );
  const suggestedName = useSuggestedName(videoId, clipper.info?.title ?? "", lines, sections, existingNames);
  const total = sectionsLength(sections);

  // The room kept after the video's end (at Fit, and at the far right when zoomed in), as a share of the lane.
  const padFrac = s.width > 0 ? END_PAD_PX / s.width : 0;
  const win = windowFor(duration, tools.zoom, s.focus ?? playhead, padFrac);
  // A range being moved reads as one with any section it touches, and only joins when the mouse is let go.
  const movingDrag = s.drag?.kind === "move" && s.drag.moved ? s.drag : null;
  // The same goes for a range drawn with the Range tool and for a dragged handle: any drag that leaves the
  // selected range touching or over another section shows them as one, and joins them on release.
  const shaping = movingDrag || s.drag?.kind === "edge" || s.drag?.kind === "range" ? s.drag : null;
  const mergeHint =
    shaping && range && s.width > 0 ? touching(range, store.segments, TOUCH_PX * ((win.end - win.start) / s.width)) : null;
  const shownSections = useMemo(
    () =>
      mergeHint
        ? [...store.segments.filter((_, i) => !mergeHint.indices.includes(i)), mergeHint.union].sort((a, b) => a.start - b.start)
        : sections,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sections, mergeHint?.union.start, mergeHint?.union.end],
  );
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
  const ticks = axisTicks(axis, 110, { start: 0, end: duration });

  const used: readonly NamedRange[] = videoId && active ? (active.usedRanges[videoId] ?? []) : [];
  const waiting = store.banked;

  useTimelineEffects({
    framed: sections.length === 1 ? sections[0] : null,
    seek: (t: number) => clipper.requestSeek(t),
    range,
    duration,
    playhead,
    zoom: tools.zoom,
    padFrac,
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
  // Never past the video: the padding after its end, and the view out past Fit, are not footage.
  const inVideo = (t: number | null) => (t === null ? null : Math.min(Math.max(0, t), duration));
  const timeAt = (e: PointerEvent<HTMLElement>): number | null => inVideo(toT(axis, e.clientX - laneLeft(e)));
  const snap = (t: number, edge: "start" | "end") => Math.round(snapToWord(lines, t, edge));

  const setRange = (a: number, b: number) => {
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);
    if (hi - lo < 1) return;
    const from = snap(lo, "start");
    const to = snap(hi, "end");
    if (to <= from) return;
    markByHand();
    clipper.setRangeFromSeconds(from, to); // both at once, in order: neither end reads the other's old text
  };

  const swallowClick = useRef(false);
  /** The click that follows a tool press on a button is that tool's, not the button's. */
  const onLaneClickCapture = (e: { stopPropagation: () => void }) => {
    if (!swallowClick.current) return;
    swallowClick.current = false;
    e.stopPropagation();
  };

  /** Zoom to `zoom` keeping time `t`, at lane position `x`, under the same spot (a pinch or click zooms into the point). */
  const zoomAt = (x: number, t: number, zoom: number) => {
    const next = Math.min(100, Math.max(ZOOM_MIN, zoom));
    if (!folded && s.width > 0) s.setFocus(focusForAnchor(duration, next, t, x / s.width, padFrac));
    else s.setFocus(t);
    tools.setZoom(next);
  };

  /** Pointer down on the Source lane. What it does depends on the tool. */
  const onLanePointerDown = (e: PointerEvent<HTMLElement>) => {
    swallowClick.current = false;
    const target = e.target as HTMLElement;
    // Fields (the name box) keep their own presses. A button (a clip bar, the fold) keeps its click with the
    // pointer; every other tool works on top of it too, and its click is then swallowed.
    if (target.closest("input, textarea, [contenteditable='true']")) return;
    const onButton = !!target.closest("button");
    if (onButton && tools.tool === "pointer") return;
    swallowClick.current = onButton;
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
      marksBeforeDrag.current = { start: clipper.startText, end: clipper.endText };
      promoted.current = false;
      if (range) {
        const edge = grabbedEdge(x, toX(axis, range.start), toX(axis, range.end));
        if (edge) {
          frozen.current = shown;
          // The other edge stays where it is whatever the pointer does, so pulling past it flips the range.
          return s.setDrag({ kind: "edge", edge, fixed: edge === "start" ? range.end : range.start });
        }
      }
      frozen.current = shown;
      s.setDrag({ kind: "range", anchor: t });
      s.setDragOrigin(e.clientX);
      return;
    }
    // On the Source lane the pointer also works the selected range: a grabbed edge resizes it, its body moves it
    // (length kept). A press on the body that never moves is just a click, which goes to that spot.
    if (target.closest('[data-lane="source"]')) {
      const hit = pickSection(
        x,
        [...(range ? [{ id: "range" as const, r: range }] : []), ...store.segments.map((r, i) => ({ id: i, r }))],
        (tt) => toX(axis, tt),
        grabbedEdge,
      );
      if (hit) {
        marksBeforeDrag.current = { start: clipper.startText, end: clipper.endText, segments: store.segments.map((x0) => ({ ...x0 })) };
        promoted.current = hit.id !== "range";
        // A locked section is taken up as the selected range (the one that was selected locks in its place), so
        // every section moves, resizes and merges the same way. Esc, or a press that never moves, puts all back.
        if (hit.id !== "range") {
          if (range) store.add(range, { duration: duration || undefined });
          store.remove(hit.id);
          clipper.setRangeFromSeconds(hit.r.start, hit.r.end);
        }
        frozen.current = shown;
        s.setDragOrigin(e.clientX);
        if (hit.edge) return s.setDrag({ kind: "edge", edge: hit.edge, fixed: hit.edge === "start" ? hit.r.end : hit.r.start });
        return s.setDrag({ kind: "move", grab: t - hit.r.start, len: hit.r.end - hit.r.start, pressedAt: t, moved: false });
      }
    }
    // The pointer only moves the playhead: a click goes there, a drag scrubs along the video.
    s.setDrag({ kind: "scrub" });
    clipper.requestSeek(Math.round(t));
  };

  // B3-2: Esc during a Select range drag puts the marks back as they were and ends the drag.
  const marksBeforeDrag = useRef<{ start: string; end: string; segments?: { start: number; end: number }[] } | null>(null);
  /** A locked section was taken up as the selected range by the press now being dragged. */
  const promoted = useRef(false);
  const dragKind = s.drag?.kind;
  useEffect(() => {
    if (dragKind !== "range" && dragKind !== "edge" && dragKind !== "move") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const before = marksBeforeDrag.current;
      if (before) {
        clipper.setStartText(before.start);
        clipper.setEndText(before.end);
        if (before.segments) store.load(before.segments);
      }
      frozen.current = null;
      s.setDrag(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragKind]);

  // An unsaved range goes away with its ×, or with Esc (never mid-drag, never while typing or in a dialog or menu).
  const clearRange = () => {
    clipper.setStartText("");
    clipper.setEndText("");
    s.setScissorsStart(null);
  };
  const tabActive = useIsTabActive();
  const hasRange = !!range;
  const dragging = !!s.drag;
  useEffect(() => {
    if (!tabActive || !hasRange || dragging) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || dialogOpen() || document.querySelector('[role="menu"]')) return;
      const el = e.target as HTMLElement | null;
      if (el && (["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.isContentEditable)) return;
      clearRange();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabActive, hasRange, dragging]);

  const lastScrub = useRef<number | null>(null);
  // The handle the pointer is over (as its time), so it can show it is clickable. Only the Pointer and the
  // Range tool work handles, and only over the Source lane.
  const [hoverGrip, setHoverGrip] = useState<number | null>(null);
  const hoverAt = (e: PointerEvent<HTMLElement>) => {
    let found: number | null = null;
    const x = e.clientX - laneLeft(e);
    if ((tools.tool === "pointer" || tools.tool === "range") && x >= 0 && x <= s.width && (e.target as HTMLElement).closest('[data-lane="source"]')) {
      for (const r of shownSections) {
        const edge = grabbedEdge(x, toX(axis, r.start), toX(axis, r.end));
        if (edge) {
          found = edge === "start" ? r.start : r.end;
          break;
        }
      }
    }
    setHoverGrip((cur) => (cur === found ? cur : found));
  };
  const onLanePointerMove = (e: PointerEvent<HTMLElement>) => {
    const d = s.drag;
    if (!d || e.buttons !== 1) return hoverAt(e);
    pointer.current = { clientX: e.clientX, left: laneLeft(e) };
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
    dragTo(d, e.clientX, laneLeft(e));
  };

  /** Move the scrub / range / edge drag to where the pointer is (kept on the lane: past the end is the end). */
  const dragTo = (d: NonNullable<typeof s.drag>, clientX: number, left: number) => {
    const t = inVideo(toT(axis, clampX(clientX - left, s.width)));
    if (t === null) return;
    if (d.kind === "move") {
      if (!d.moved && Math.abs(clientX - s.dragOrigin) < DRAG_START_PX) return;
      if (!d.moved) s.setDrag({ ...d, moved: true });
      const r = movedRange(d.len, d.grab, t, duration);
      clipper.setRangeFromSeconds(r.start, r.end);
    } else if (d.kind === "edge") {
      setRange(d.fixed, t);
    } else if (d.kind === "range" && Math.abs(clientX - s.dragOrigin) >= DRAG_START_PX) {
      setRange(d.anchor, t);
    }
  };

  // Dragging the playhead or a range edge to either end of a zoomed timeline scrolls it, so the rest of the
  // video can be reached by dragging. The pointer keeps arriving while it is held at the edge or beyond it.
  const pointer = useRef({ clientX: 0, left: 0 });
  const scrollRef = useRef<() => void>(() => {});
  scrollRef.current = () => {
    const d = s.drag;
    if (!d || d.kind === "pan" || !(duration > 0) || tools.zoom <= 0) return;
    const v = edgeScroll(pointer.current.clientX - pointer.current.left, s.width);
    if (!v) return;
    const per = (win.end - win.start) / Math.max(1, s.width);
    const next = Math.min(duration, Math.max(0, (s.focus ?? (win.start + win.end) / 2) + v * per * EDGE_SCROLL_PX));
    if (frozen.current && frozen.current.folded) return;
    if (frozen.current) frozen.current = { axis: linearAxis(windowFor(duration, tools.zoom, next, padFrac), s.width) as Axis, fold: [], folded: false };
    s.setFocus(next);
    if (d.kind === "scrub") {
      const at = toT(axis, clampX(pointer.current.clientX - pointer.current.left, s.width));
      if (at !== null) clipper.requestSeek(Math.round(Math.min(Math.max(0, at), duration)));
    } else dragTo(d, pointer.current.clientX, pointer.current.left);
  };
  const scrolling = dragKind === "scrub" || dragKind === "range" || dragKind === "edge" || dragKind === "move";
  useEffect(() => {
    if (!scrolling) return;
    const id = window.setInterval(() => scrollRef.current(), 40);
    return () => window.clearInterval(id);
  }, [scrolling]);

  const onLanePointerUp = () => {
    const d = s.drag;
    s.setDrag(null);
    if (d?.kind === "move") {
      frozen.current = null;
      if (!d.moved) {
        const before = marksBeforeDrag.current;
        if (promoted.current && before) {
          clipper.setStartText(before.start);
          clipper.setEndText(before.end);
          if (before.segments) store.load(before.segments);
        }
        clipper.requestSeek(Math.round(d.pressedAt));
      }
    }
    // Let go while touching, whichever way the range got there (moved, resized, or drawn): the sections become
    // one range (the touched ones fold into it).
    const joinable = d?.kind === "edge" || d?.kind === "range" || (d?.kind === "move" && d.moved);
    if (joinable && mergeHint) {
      [...mergeHint.indices].sort((a, b) => b - a).forEach((i) => store.remove(i));
      clipper.setRangeFromSeconds(mergeHint.union.start, mergeHint.union.end);
    }
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
      const at = inVideo(toT(axis, x));
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
    sections: shownSections,
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
    /** A selected range is being moved with the Pointer: it shows its times as a pill. */
    moving: !!movingDrag,
    /** The one range a moved range and the sections it touches would make if let go now. */
    mergeHint: mergeHint?.union ?? null,
    /** The handle (its time) the pointer is over, and the one held down while it is dragged. */
    hoverGrip: s.drag ? null : hoverGrip,
    pressedGrip: s.drag?.kind === "edge" && range ? (mergeHint ? (s.drag.edge === "start" ? mergeHint.union.start : mergeHint.union.end) : s.drag.edge === "start" ? range.start : range.end) : null,
    onLanePointerLeave: () => setHoverGrip(null),
    start: clipper.start,
    inText: range ? clockTime(range.start) : startPicked ? clockTime(clipper.start) : dash,
    outText: range ? clockTime(range.end) : endPicked ? clockTime(clipper.end) : dash,
    lengthText: total > 0 ? lengthLabel(total) : dash,
    /** The whole joined clip in seconds, for the campaign's length rule. */
    totalSeconds: total,
    onLanePointerDown,
    onLanePointerMove,
    onLanePointerUp,
    onLaneWheel,
    onLaneClickCapture,
    addSection,
    clearRange,
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
