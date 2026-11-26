/**
 * File: useSegmentsState.ts
 * Path: src/renderer/src/shared/hooks/useSegmentsState.ts
 * Description: The clip being built (a list of segments), shared by the Timeline and the
 *   MarkBar without props. Each workspace tab owns its OWN store (created by the
 *   TabActiveProvider that wraps the tab, provided through SegmentStoreContext), because
 *   App.tsx mounts every tab at once: one shared store let a new tab wipe another tab's
 *   segments (B-2) and let two ClipsColumns overwrite each other's banked ranges until
 *   React gave up with error #185 (C-1).
 *
 *   The old module-level functions (setPlayhead, setBankedRanges, clearSegments, ...) are
 *   kept for callers that have no hook in hand; they act on the ACTIVE tab's store. Code
 *   that runs on behalf of a particular tab should use the bound methods that useSegmentsState()
 *   returns instead.
 */
import { createContext, useContext, useSyncExternalStore } from "react";
import {
  addSegment,
  moveSegment,
  removeSegment,
  totalDuration,
  type AddResult,
  type NamedRange,
  type Range,
  type Segment,
} from "../utils/segments";

export type SegmentsState = {
  /** Which source video these segments belong to. */
  videoId: string | null;
  segments: Segment[];
  /** Playhead in seconds, published by whoever owns the player. */
  playhead: number;
  /** Banked (planned, not yet cut) ranges for this video, drawn as hollow outlines. */
  banked: NamedRange[];
  /**
   * True while a cut of this clip is running. The cut was launched with a snapshot of the
   * list, so edits made now would not reach the file (B-7); they are refused instead.
   */
  locked: boolean;
  /**
   * The bank item these marks stand for, after a bank card was clicked: trimming or moving its
   * edges edits that item, and pressing Clip counts as making it. Null for any other marks.
   */
  bankId: string | null;
};

const EMPTY: Segment[] = [];
const EMPTY_BANKED: NamedRange[] = [];

function sameRanges(a: readonly NamedRange[], b: readonly NamedRange[]): boolean {
  if (a.length !== b.length) return false;
  return a.every(
    (r, i) => r.start === b[i].start && r.end === b[i].end && r.label === b[i].label && r.clipId === b[i].clipId,
  );
}

export type SegmentStore = ReturnType<typeof createSegmentStore>;

export function createSegmentStore() {
  let state: SegmentsState = {
    videoId: null,
    segments: EMPTY,
    playhead: 0,
    banked: EMPTY_BANKED,
    locked: false,
    bankId: null,
  };
  const listeners = new Set<() => void>();
  // Set by restore(): the video a saved clip belongs to, while the tab's clipper has not yet
  // caught up to it. A relaunch (or Ctrl+Shift+T) puts the clip back first and only then
  // sets the url, so every mount-time syncVideo(null) in between would wipe it (B2-4/B2-5).
  let awaitingVideo: string | null = null;

  const set = (next: Partial<SegmentsState>) => {
    state = { ...state, ...next };
    listeners.forEach((l) => l());
  };

  return {
    get: (): SegmentsState => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    /** Add a range to the clip. Returns the result so the caller can say why it was refused. */
    add(range: Range, opts: { duration?: number } = {}): AddResult {
      if (state.locked) return { ok: false, reason: "empty", segments: [...state.segments] };
      const result = addSegment(state.segments, range, opts);
      if (result.ok) set({ segments: result.segments });
      return result;
    },
    remove(index: number) {
      if (state.locked) return;
      set({ segments: removeSegment(state.segments, index) });
    },
    move(from: number, to: number) {
      if (state.locked) return;
      set({ segments: moveSegment(state.segments, from, to) });
    },
    /** Replace the clip's segments, e.g. when a bank row is clicked. */
    load(segments: readonly Segment[], bankId?: string) {
      if (state.locked) return;
      set({ segments: segments.map((s) => ({ start: s.start, end: s.end })), ...(bankId !== undefined ? { bankId } : {}) });
    },
    /** Always allowed: it is how a finished cut empties its own clip. */
    clear() {
      if (state.segments.length || state.bankId) set({ segments: EMPTY, bankId: null });
    },
    /** The marks no longer stand for a bank item (a new clip was started, or the item is gone). */
    detachBank() {
      if (state.bankId) set({ bankId: null });
    },
    /** Segments belong to one video: a new video starts a new clip. */
    syncVideo(videoId: string | null) {
      if (awaitingVideo !== null) {
        // The clipper has not reached the restored video yet: "no video" is not a change.
        if (videoId === null) return;
        awaitingVideo = null;
      }
      if (state.videoId === videoId) return;
      set({ videoId, segments: EMPTY, banked: EMPTY_BANKED, bankId: null });
    },
    /** Put back a clip saved from an earlier session, together with the video it belongs to. */
    restore(videoId: string | null, segments: readonly Segment[]) {
      awaitingVideo = videoId && segments.length ? videoId : null;
      set({
        videoId,
        segments: segments.length ? segments.map((s) => ({ start: s.start, end: s.end })) : EMPTY,
        banked: EMPTY_BANKED,
      });
    },
    setPlayhead(seconds: number) {
      if (state.playhead !== seconds) set({ playhead: seconds });
    },
    setBanked(ranges: readonly NamedRange[]) {
      // Publishing an identical plan must not notify: it is what let two writers loop.
      if (sameRanges(state.banked, ranges)) return;
      set({ banked: ranges.length ? [...ranges] : EMPTY_BANKED });
    },
    setLocked(locked: boolean) {
      if (state.locked !== locked) set({ locked });
    },
  };
}

/** Used when nothing provides a store (tests, a stray mount) and as the "no tab" fallback. */
const defaultStore = createSegmentStore();
let activeStore: SegmentStore = defaultStore;

/** The tab on screen calls this so the module-level helpers below know whose clip to touch. */
export function setActiveSegmentStore(store: SegmentStore | null) {
  activeStore = store ?? defaultStore;
}
export function getActiveSegmentStore(): SegmentStore {
  return activeStore;
}

export const SegmentStoreContext = createContext<SegmentStore | null>(null);

// ---- module-level helpers: act on the ACTIVE tab's store ----------------------------------
export function appendSegment(range: Range, opts: { duration?: number } = {}): AddResult {
  return activeStore.add(range, opts);
}
export function dropSegment(index: number) {
  activeStore.remove(index);
}
export function reorderSegment(from: number, to: number) {
  activeStore.move(from, to);
}
export function loadSegments(segments: readonly Segment[]) {
  activeStore.load(segments);
}
export function clearSegments() {
  activeStore.clear();
}
export function syncVideo(videoId: string | null) {
  activeStore.syncVideo(videoId);
}
export function setPlayhead(seconds: number) {
  activeStore.setPlayhead(seconds);
}
export function setBankedRanges(ranges: readonly NamedRange[]) {
  activeStore.setBanked(ranges);
}
/** Read the active tab's segments outside React (key handlers, cut wiring). */
export function getSegments(): Segment[] {
  return activeStore.get().segments;
}

export function useSegmentStore(): SegmentStore {
  return useContext(SegmentStoreContext) ?? defaultStore;
}

export function useSegmentsState() {
  const store = useSegmentStore();
  const snap = useSyncExternalStore(store.subscribe, store.get, store.get);
  return {
    store,
    segments: snap.segments,
    total: totalDuration(snap.segments),
    playhead: snap.playhead,
    banked: snap.banked,
    locked: snap.locked,
    bankId: snap.bankId,
    detachBank: store.detachBank,
    add: store.add,
    remove: store.remove,
    move: store.move,
    load: store.load,
    clear: store.clear,
    syncVideo: store.syncVideo,
    setBanked: store.setBanked,
    setPlayhead: store.setPlayhead,
  };
}
