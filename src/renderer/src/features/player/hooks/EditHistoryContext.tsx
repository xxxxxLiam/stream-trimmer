/**
 * File: EditHistoryContext.tsx
 * Path: src/renderer/src/features/player/hooks/EditHistoryContext.tsx
 * Description: Undo and Redo for one tab. Watches what the timeline edits (the picked In and Out, the sections,
 *   the bank item they stand for, and the video's waiting list), keeps the steps, and answers Cmd/Ctrl+Z and
 *   Shift+Cmd/Ctrl+Z. It lives with the tab, not the Timeline panel, so closing the panel does not lose the steps.
 *   A cut starts fresh: what was cut cannot be un-cut.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useSyncExternalStore, type ReactNode } from "react";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import { useSegmentsState } from "../../../shared/hooks/useSegmentsState";
import { bankStore, clipsFor, type BankedClip } from "../../../shared/utils/bank";
import { dialogOpen } from "../../../shared/utils/dialogOpen";
import type { Segment } from "../../../shared/utils/segments";
import { useCampaign } from "../../campaigns/hooks/CampaignContext";
import { useIsTabActive } from "../../workspace/hooks/WorkspaceContext";
import { createEditHistory } from "../utils/editHistory";
import { editAction, ownsUndo } from "../utils/editKeys";

type Snapshot = { startText: string; endText: string; segments: Segment[]; bankId: string | null; clips: BankedClip[] };
const same = (a: Snapshot, b: Snapshot) => JSON.stringify(a) === JSON.stringify(b);
/** A step ends this long after the last change, and shortly after a pointer is let go. */
const SETTLE_MS = 400;
const AFTER_POINTER_MS = 120;

type Controls = { canUndo: boolean; canRedo: boolean; undo: () => void; redo: () => void };
const NONE: Controls = { canUndo: false, canRedo: false, undo: () => {}, redo: () => {} };
const Ctx = createContext<Controls>(NONE);

export function useEditHistory(): Controls {
  return useContext(Ctx);
}

export function EditHistoryProvider({ children }: { children: ReactNode }) {
  const clipper = useClipperContext();
  const store = useSegmentsState();
  const { active } = useCampaign();
  const tabActive = useIsTabActive();
  const history = useMemo(() => createEditHistory<Snapshot>(same), []);
  const campaignId = active?.id ?? null;
  const videoId = clipper.videoId ?? null;
  const bank = useSyncExternalStore(bankStore.subscribe, bankStore.get, bankStore.get);
  const clips = useMemo(() => (campaignId && videoId ? clipsFor(bank, campaignId, videoId) : []), [bank, campaignId, videoId]);

  const snapshot: Snapshot = { startText: clipper.startText, endText: clipper.endText, segments: store.segments, bankId: store.bankId, clips };
  const latest = useRef(snapshot);
  latest.current = snapshot;

  // A new video or campaign, or a cut starting, begins a new history.
  const scope = `${campaignId}|${videoId}|${store.locked}`;
  useEffect(() => {
    history.reset(latest.current);
  }, [scope, history]);

  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerDown = useRef(false);
  const settleLater = useCallback(
    (ms: number) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        if (pointerDown.current) return settleLater(SETTLE_MS);
        history.settle();
      }, ms);
    },
    [history],
  );
  useEffect(() => {
    history.change(snapshot);
    settleLater(SETTLE_MS);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.startText, snapshot.endText, snapshot.segments, snapshot.bankId, snapshot.clips]);
  useEffect(() => {
    const down = () => {
      pointerDown.current = true;
    };
    const up = () => {
      pointerDown.current = false;
      settleLater(AFTER_POINTER_MS);
    };
    window.addEventListener("pointerdown", down, true);
    window.addEventListener("pointerup", up, true);
    return () => {
      window.removeEventListener("pointerdown", down, true);
      window.removeEventListener("pointerup", up, true);
      if (timer.current) clearTimeout(timer.current);
    };
  }, [settleLater]);

  const apply = useCallback(
    (s: Snapshot) => {
      if (campaignId && videoId) bankStore.setClips(campaignId, videoId, s.clips);
      clipper.setStartText(s.startText);
      clipper.setEndText(s.endText);
      store.load(s.segments, s.bankId ?? undefined);
      if (!s.bankId) store.detachBank();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [campaignId, videoId, clipper.setStartText, clipper.setEndText, store.load, store.detachBank],
  );
  const undo = useCallback(() => {
    if (store.locked) return;
    const s = history.undo();
    if (s) apply(s);
  }, [history, apply, store.locked]);
  const redo = useCallback(() => {
    if (store.locked) return;
    const s = history.redo();
    if (s) apply(s);
  }, [history, apply, store.locked]);

  const mac = typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);
  const act = useRef({ undo, redo });
  act.current = { undo, redo };
  useEffect(() => {
    if (!tabActive) return;
    const onKey = (e: KeyboardEvent) => {
      const a = editAction(e, mac);
      // Typing in a field keeps its own undo; a drawer or dialog owns the keys behind it.
      if (!a || ownsUndo(e.target as HTMLElement | null) || dialogOpen()) return;
      e.preventDefault();
      act.current[a]();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tabActive, mac]);

  const view = useSyncExternalStore(history.subscribe, history.get, history.get);
  const value = useMemo(() => ({ canUndo: view.canUndo, canRedo: view.canRedo, undo, redo }), [view, undo, redo]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
