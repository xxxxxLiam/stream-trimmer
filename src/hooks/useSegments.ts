/**
 * File: useSegments.ts
 * Path: src/hooks/useSegments.ts
 * Description: The clip being built (a list of segments), shared by the Timeline and the
 *   MarkBar without a provider: the mount points in App.tsx take no props, so the state
 *   lives in one small module store read through useSyncExternalStore. Other packages can
 *   drive it with the exported actions (loadSegments from the clip bank, setPlayhead from
 *   the player, setBankedRanges from the bank).
 */
import { useSyncExternalStore } from "react";
import {
  addSegment,
  moveSegment,
  removeSegment,
  totalDuration,
  type AddResult,
  type NamedRange,
  type Range,
  type Segment,
} from "../lib/segments";

type SegmentsState = {
  /** Which source video these segments belong to. */
  videoId: string | null;
  segments: Segment[];
  /** Playhead in seconds, published by whoever owns the player. */
  playhead: number;
  /** Banked (planned, not yet cut) ranges for this video, drawn as hollow outlines. */
  banked: NamedRange[];
};

const EMPTY: Segment[] = [];
const EMPTY_BANKED: NamedRange[] = [];

let state: SegmentsState = {
  videoId: null,
  segments: EMPTY,
  playhead: 0,
  banked: EMPTY_BANKED,
};
const listeners = new Set<() => void>();

function set(next: Partial<SegmentsState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Add a range to the clip. Returns the result so the caller can say why it was refused. */
export function appendSegment(range: Range, opts: { duration?: number } = {}): AddResult {
  const result = addSegment(state.segments, range, opts);
  if (result.ok) set({ segments: result.segments });
  return result;
}

export function dropSegment(index: number) {
  set({ segments: removeSegment(state.segments, index) });
}

export function reorderSegment(from: number, to: number) {
  set({ segments: moveSegment(state.segments, from, to) });
}

/** Replace the clip's segments, e.g. when a bank row is clicked. */
export function loadSegments(segments: readonly Segment[]) {
  set({ segments: segments.map((s) => ({ start: s.start, end: s.end })) });
}

export function clearSegments() {
  if (state.segments.length) set({ segments: EMPTY });
}

/** Segments belong to one video: a new video starts a new clip. */
export function syncVideo(videoId: string | null) {
  if (state.videoId === videoId) return;
  set({ videoId, segments: EMPTY, banked: EMPTY_BANKED });
}

export function setPlayhead(seconds: number) {
  if (state.playhead !== seconds) set({ playhead: seconds });
}

export function setBankedRanges(ranges: readonly NamedRange[]) {
  set({ banked: ranges.length ? [...ranges] : EMPTY_BANKED });
}

/** Read the current segments outside React (key handlers, cut wiring). */
export function getSegments(): Segment[] {
  return state.segments;
}

export function useSegments() {
  const snap = useSyncExternalStore(subscribe, () => state, () => state);
  return {
    segments: snap.segments,
    total: totalDuration(snap.segments),
    playhead: snap.playhead,
    banked: snap.banked,
    add: appendSegment,
    remove: dropSegment,
    move: reorderSegment,
    load: loadSegments,
    clear: clearSegments,
    syncVideo,
  };
}
