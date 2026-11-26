/**
 * File: WorkspaceContext.tsx
 * Path: src/renderer/src/features/workspace/hooks/WorkspaceContext.tsx
 * Description: Browser-style workspace tabs — list, active tab, per-tab title/busy reporting.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import { extractVideoId } from "../../../shared/utils/clip";
import type { Segment } from "../../../shared/utils/segments";
import { useClipperContext } from "../../../modules/clipper/hooks/ClipperContext";
import {
  SegmentStoreContext,
  createSegmentStore,
  setActiveSegmentStore,
  useSegmentsState,
  type SegmentStore,
} from "../../../shared/hooks/useSegmentsState";
import { setDone, nextOpenId } from "../utils/videoList";
import { activeAfterClose, moveItem, stepIndex } from "../../../shared/utils/tabOps";
import { workspaceShortcut } from "../utils/workspaceShortcuts";
import { abandon, backTarget, savedWorkspace, type CameFrom, type Trying } from "../utils/tabHistory";

const STORE_KEY = "clipper.workspaces";

const DEFAULT_TAB_NAME = "New tab";

export type WorkspaceTab = {
  id: string;
  /** User-assigned name; empty means "use the auto title". */
  name: string;
  /** The link loaded in this tab, so a relaunch or a reopen brings the video back. */
  url?: string;
  /** The unsaved clip (marked segments) of this tab. */
  segments?: Segment[];
  /** The campaign this tab is cutting for. Each tab keeps its own. */
  campaignId?: string;
  /** Folded into "Done" in the Videos list. Nothing is deleted. */
  done?: boolean;
  /** The In and Out picked by hand and not yet locked in, as the timestamps the fields hold (B-11). */
  picked?: { start: string; end: string };
};

/** How many closed tabs Ctrl+Shift+T can bring back. */
const CLOSED_LIMIT = 10;

export type ClosedTab = { tab: WorkspaceTab; index: number };

export function cleanTab(t: WorkspaceTab): WorkspaceTab {
  const out: WorkspaceTab = { id: t.id, name: typeof t.name === "string" ? t.name : "" };
  if (typeof t.url === "string" && t.url) out.url = t.url;
  if (typeof t.campaignId === "string" && t.campaignId) out.campaignId = t.campaignId;
  if (t.done === true) out.done = true;
  const pk = t.picked;
  if (pk && typeof pk.start === "string" && typeof pk.end === "string" && (pk.start.trim() || pk.end.trim())) {
    out.picked = { start: pk.start.trim(), end: pk.end.trim() };
  }
  if (Array.isArray(t.segments)) {
    const segs = t.segments.filter(
      (s) => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start,
    );
    if (segs.length) out.segments = segs.map((s) => ({ start: s.start, end: s.end }));
  }
  return out;
}

type TabMeta = { title: string; busy: boolean };

export type PersistedState = { tabs: WorkspaceTab[]; activeId: string };

function newId(): string {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

/** What a relaunch makes of the stored workspace record; null when nothing usable is stored. */
export function parsePersisted(raw: PersistedState | null | undefined): PersistedState | null {
  if (!raw || !Array.isArray(raw.tabs) || raw.tabs.length === 0) return null;
  const tabs = raw.tabs.filter((t) => t && typeof t.id === "string").map(cleanTab);
  if (tabs.length === 0) return null;
  const activeId = tabs.some((t) => t.id === raw.activeId) ? raw.activeId : tabs[0].id;
  return { tabs, activeId };
}

/** Record what tab `id` holds. Returns the same array when nothing changed. */
export function applyTabWork(
  tabs: WorkspaceTab[],
  id: string,
  work: { url: string; segments: readonly Segment[]; picked?: { start: string; end: string } },
): WorkspaceTab[] {
  let changed = false;
  const next = tabs.map((t) => {
    if (t.id !== id) return t;
    const url = work.url || undefined;
    const a = t.segments ?? [];
    const same =
      t.url === url &&
      a.length === work.segments.length &&
      a.every((s, i) => s.start === work.segments[i].start && s.end === work.segments[i].end) &&
      cleanTab({ id: t.id, name: t.name, picked: work.picked }).picked?.start === t.picked?.start &&
      cleanTab({ id: t.id, name: t.name, picked: work.picked }).picked?.end === t.picked?.end;
    if (same) return t;
    changed = true;
    return cleanTab({
      id: t.id,
      name: t.name,
      url,
      segments: work.segments as Segment[],
      campaignId: t.campaignId,
      done: t.done,
      picked: work.picked,
    });
  });
  return changed ? next : tabs;
}

/** Put a closed tab back where it was. */
export function reinsertTab(tabs: WorkspaceTab[], closed: ClosedTab): WorkspaceTab[] {
  if (tabs.some((t) => t.id === closed.tab.id)) return tabs;
  const next = [...tabs];
  next.splice(Math.min(closed.index, next.length), 0, closed.tab);
  return next;
}

function loadState(): PersistedState {
  const parsed = parsePersisted(readSetting<PersistedState | null>(STORE_KEY, null));
  if (parsed) return parsed;
  const id = newId();
  return { tabs: [{ id, name: "" }], activeId: id };
}

export type WorkspaceState = {
  tabs: WorkspaceTab[];
  activeId: string;
  meta: Record<string, TabMeta>;
  labelFor: (id: string) => string;
  selectTab: (id: string) => void;
  /** Open a new video; with a link it loads that video. */
  addTab: (url?: string) => void;
  /** The video "Back" returns to from tab `id` (the one it was added from), or null. */
  backTargetFor: (id: string) => string | null;
  /** Leave a video that would not open: it is dropped and the one you came from is shown. */
  goBack: (id: string) => void;
  /** The tab's link opened, so it is a real video now and is saved (and shown, if it was opening in the background). */
  markOpened: (id: string) => void;
  /** A pasted link is opening in the background: you stay on the video you are on until it has opened. */
  opening: boolean;
  /** The tab whose link is opening, or null. */
  openingId: string | null;
  /** Why the last pasted link did not open (shown in the link field's panel), or "". */
  openFailure: string;
  /** The link a tab was opening would not open: the tab is dropped, you stay where you were, and the field says why. */
  failOpening: (id: string, message: string) => void;
  clearOpenFailure: () => void;
  /** Fold a video into Done, or bring it back. Marking the open one moves to the next open video. */
  setTabDone: (id: string, done: boolean) => void;
  /** Close a tab. False when the user backed out of the confirmation and nothing closed. */
  closeTab: (id: string, opts?: { silent?: boolean }) => boolean;
  /** Put tab `id` at `toIndex` (drag, or the keyboard move). */
  moveTab: (id: string, toIndex: number) => void;
  renameTab: (id: string, name: string) => void;
  /** Bring back the most recently closed tab (Ctrl/Cmd+Shift+T). Returns false when none. */
  reopenTab: (id?: string) => boolean;
  closedCount: number;
  /** A tab reports what it holds so a relaunch or reopen can restore it. */
  reportTabWork: (
    id: string,
    work: { url: string; segments: readonly Segment[]; picked?: { start: string; end: string } },
  ) => void;
  /** Remember which campaign a tab is cutting for. */
  setTabCampaign: (id: string, campaignId: string) => void;
  reportTab: (
    id: string,
    meta: TabMeta & { cancel?: () => void },
  ) => void;
};

const WorkspaceContext = createContext<WorkspaceState | null>(null);

const TabActiveContext = createContext<boolean>(true);

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const initial = useRef<PersistedState | null>(null);
  if (initial.current === null) initial.current = loadState();
  const [tabs, setTabs] = useState<WorkspaceTab[]>(initial.current.tabs);
  const [activeId, setActiveId] = useState<string>(initial.current.activeId);
  const [meta, setMeta] = useState<Record<string, TabMeta>>({});
  const cancels = useRef<Map<string, () => void>>(new Map());
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const [closed, setClosed] = useState<ClosedTab[]>([]);
  const closedRef = useRef(closed);
  closedRef.current = closed;
  const metaRef = useRef(meta);
  metaRef.current = meta;
  const activeRef = useRef(activeId);
  activeRef.current = activeId;

  // A video added from a pasted link remembers where you were and is not saved until it has opened (B2-1).
  const [cameFrom, setCameFrom] = useState<CameFrom>({});
  const [trying, setTrying] = useState<Trying>({});
  const cameFromRef = useRef(cameFrom);
  cameFromRef.current = cameFrom;
  // A link pasted into the top bar opens in the background: the video you are on stays on screen until it has opened.
  const [openingId, setOpeningId] = useState<string | null>(null);
  const openingRef = useRef<string | null>(null);
  openingRef.current = openingId;
  const [openFailure, setOpenFailure] = useState("");

  useEffect(() => {
    writeSetting(STORE_KEY, savedWorkspace(tabs, activeId, trying, cameFrom));
  }, [tabs, activeId, trying, cameFrom]);

  const selectTab = useCallback((id: string) => setActiveId(id), []);

  const addTab = useCallback((url?: string) => {
    const id = newId();
    const link = typeof url === "string" ? url.trim() : "";
    setCameFrom((prev) => ({ ...prev, [id]: activeRef.current }));
    if (link) setTrying((prev) => ({ ...prev, [id]: true }));
    setTabs((prev) => [...prev, link ? { id, name: "", url: link } : { id, name: "" }]);
    if (link) {
      // The new video is selected at once and says it is opening; a failure goes back to the video you were on
      // and never leaves the workspace.
      setOpenFailure("");
      setOpeningId(id);
    }
    setActiveId(id);
  }, []);

  const backTargetFor = useCallback((id: string) => backTarget(tabsRef.current, cameFromRef.current, id), []);

  const failOpening = useCallback((id: string, message: string) => {
    if (openingRef.current !== id) return;
    setOpeningId(null);
    setOpenFailure(message || "That link did not open.");
    cancels.current.delete(id);
    setTrying((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    // Selected while it opened: go back to the video that was open before it.
    if (activeRef.current === id) {
      const back = cameFromRef.current[id];
      const fallback = tabsRef.current.find((t) => t.id !== id)?.id;
      const target = back && back !== id && tabsRef.current.some((t) => t.id === back) ? back : fallback;
      if (target) setActiveId(target);
    }
    setTabs((prev) => prev.filter((t) => t.id !== id));
  }, []);
  const clearOpenFailure = useCallback(() => setOpenFailure(""), []);

  const markOpened = useCallback((id: string) => {
    if (openingRef.current === id) {
      setOpeningId(null);
      // Shown now, unless you went to another video while it opened: then it just joins the list.
      if (activeRef.current === cameFromRef.current[id]) setActiveId(id);
    }
    setTrying((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }, []);

  const goBack = useCallback((id: string) => {
    const current = tabsRef.current;
    const tab = current.find((t) => t.id === id);
    const target = backTarget(current, cameFromRef.current, id);
    // A video that opened stays in the list; one that never did goes away.
    if (tab && (!tab.url || trying[id])) {
      const gone = abandon(current, cameFromRef.current, id);
      cancels.current.delete(id);
      if (gone.tabs.length === 0) {
        const fresh = { id: newId(), name: "" };
        setTabs([fresh]);
        setActiveId(fresh.id);
        return;
      }
      setTabs(gone.tabs);
      if (gone.activeId) setActiveId(gone.activeId);
      return;
    }
    if (target) setActiveId(target);
  }, [trying]);


  const setTabDone = useCallback((id: string, done: boolean) => {
    const current = tabsRef.current;
    setTabs(setDone(current, id, done));
    if (done && activeRef.current === id) {
      const next = nextOpenId(current, id);
      if (next) setActiveId(next);
    }
  }, []);

  const closeTab = useCallback(
    (id: string, opts?: { silent?: boolean }): boolean => {
      const busy = metaRef.current[id]?.busy;
      // Remove video asks nothing (it is undoable for 8 s), so a silent close skips both prompts.
      const silent = !!opts?.silent;
      if (busy) {
        const ok =
          silent ||
          typeof window === "undefined" ||
          window.confirm(
            "This tab has a job running. Closing it will cancel that job. Continue?",
          );
        if (!ok) return false;
        cancels.current.get(id)?.();
      }
      const current = tabsRef.current;
      const closingIndex = current.findIndex((t) => t.id === id);
      const closing = current[closingIndex];
      if (!closing) return false;
      if (!busy) {
        const work = closing.segments?.length ?? 0;
        if (
          !silent &&
          work > 0 &&
          typeof window !== "undefined" &&
          !window.confirm(
            `This tab has ${work} marked segment${work === 1 ? "" : "s"} that have not been cut. Close it anyway?`,
          )
        )
          return false;
      }
      if (closing.url || closing.segments?.length || closing.name) {
        setClosed((prev) =>
          [{ tab: closing, index: closingIndex }, ...prev].slice(0, CLOSED_LIMIT),
        );
      }
      cancels.current.delete(id);
      setMeta((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      // Decided from the list as it is now, outside any state updater, so it is not
      // run twice or order-dependent.
      const nextActive = activeAfterClose(
        current.map((t) => t.id),
        id,
      );
      if (nextActive === null) {
        const fresh = { id: newId(), name: "" };
        setTabs([fresh]);
        setActiveId(fresh.id);
      } else {
        setTabs((prev) => prev.filter((t) => t.id !== id));
        setActiveId((cur) => (cur === id ? nextActive : cur));
      }
      return true;
    },
    [],
  );

  const moveTab = useCallback((id: string, toIndex: number) => {
    setTabs((prev) => moveItem(prev, id, toIndex));
  }, []);

  const renameTab = useCallback((id: string, name: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)),
    );
  }, []);

  const reportTabWork = useCallback<WorkspaceState["reportTabWork"]>((id, work) => {
    setTabs((prev) => applyTabWork(prev, id, work));
  }, []);

  const setTabCampaign = useCallback((id: string, campaignId: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id && t.campaignId !== campaignId ? { ...t, campaignId } : t)),
    );
  }, []);

  const reopenTab = useCallback((id?: string): boolean => {
    const at = id ? closedRef.current.findIndex((c) => c.tab.id === id) : 0;
    const last = closedRef.current[at];
    if (!last) return false;
    const rest = closedRef.current.filter((_, i) => i !== at);
    setClosed(rest);
    setTabs((prev) => reinsertTab(prev, last));
    setActiveId(last.tab.id);
    return true;
  }, []);

  const addTabRef = useRef(addTab);
  addTabRef.current = addTab;
  const closeTabRef = useRef(closeTab);
  closeTabRef.current = closeTab;

  // Ctrl/Cmd+number, +Tab and +PageUp/Down move between videos. T, W and Shift+T are not ours (B-13).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ids = tabsRef.current.map((t) => t.id);
      const action = workspaceShortcut(e, ids.length);
      if (!action) return;
      e.preventDefault();
      if (action.kind === "select") setActiveId(ids[action.index]);
      else if (action.kind === "step") {
        const at = ids.indexOf(activeRef.current);
        setActiveId(ids[stepIndex(at, action.back ? -1 : 1, ids.length)]);
      } else moveTab(activeRef.current, ids.indexOf(activeRef.current) + action.delta);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveTab]);

  const reportTab = useCallback<WorkspaceState["reportTab"]>(
    (id, next) => {
      if (next.cancel) cancels.current.set(id, next.cancel);
      setMeta((prev) => {
        const cur = prev[id];
        if (cur && cur.title === next.title && cur.busy === next.busy)
          return prev;
        return { ...prev, [id]: { title: next.title, busy: next.busy } };
      });
    },
    [],
  );

  const labelFor = useCallback(
    (id: string) => {
      const tab = tabs.find((t) => t.id === id);
      if (tab?.name) return tab.name;
      return meta[id]?.title || DEFAULT_TAB_NAME;
    },
    [tabs, meta],
  );

  const value = useMemo<WorkspaceState>(
    () => ({
      tabs,
      activeId,
      meta,
      labelFor,
      selectTab,
      addTab,
      backTargetFor,
      goBack,
      markOpened,
      opening: openingId !== null,
      openingId,
      openFailure,
      failOpening,
      clearOpenFailure,
      setTabDone,
      closeTab,
      moveTab,
      renameTab,
      reopenTab,
      closedCount: closed.length,
      reportTabWork,
      setTabCampaign,
      reportTab,
    }),
    [
      tabs,
      activeId,
      meta,
      labelFor,
      selectTab,
      addTab,
      backTargetFor,
      goBack,
      markOpened,
      openingId,
      openFailure,
      failOpening,
      clearOpenFailure,
      setTabDone,
      closeTab,
      moveTab,
      renameTab,
      reopenTab,
      closed.length,
      reportTabWork,
      setTabCampaign,
      reportTab,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx)
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  return ctx;
}

/**
 * Wraps one workspace tab. It owns the tab's clip store (so tabs can never touch each
 * other's segments), marks that store as the active one while the tab is on screen, locks
 * edits while a cut runs, and keeps the tab's work in the workspace record so a relaunch
 * or a reopen restores it. `tabId` is optional only for callers that cannot pass it yet:
 * without it the id is taken from the workspace's active tab while this tab is active.
 */
export function TabActiveProvider({
  active,
  tabId,
  children,
}: {
  active: boolean;
  tabId?: string;
  children: ReactNode;
}) {
  const storeRef = useRef<SegmentStore | null>(null);
  if (storeRef.current === null) storeRef.current = createSegmentStore();
  const store = storeRef.current;

  useLayoutEffect(() => {
    if (active) setActiveSegmentStore(store);
    return () => {
      if (active) setActiveSegmentStore(null);
    };
  }, [active, store]);

  return (
    <SegmentStoreContext.Provider value={store}>
      <TabActiveContext.Provider value={active}>
        <TabBridge active={active} tabId={tabId} store={store} />
        {children}
      </TabActiveContext.Provider>
    </SegmentStoreContext.Provider>
  );
}

function useOptionalClipper() {
  try {
    return useClipperContext();
  } catch {
    return null;
  }
}

function useOptionalWorkspace(): WorkspaceState | null {
  return useContext(WorkspaceContext);
}

function TabBridge({
  active,
  tabId,
  store,
}: {
  active: boolean;
  tabId?: string;
  store: SegmentStore;
}) {
  const clipper = useOptionalClipper();
  const ws = useOptionalWorkspace();
  const { segments } = useSegmentsState();
  const id = tabId ?? (active ? ws?.activeId : undefined);
  const url = clipper?.url ?? "";
  const startText = clipper?.startText ?? "";
  const endText = clipper?.endText ?? "";
  const downloading = clipper?.downloading ?? false;
  const opened = !!clipper?.info;
  const openError = clipper?.error ?? "";
  const loadingInfo = clipper?.loadingInfo ?? false;

  // Restore once, on mount, from what this tab last reported.
  const pending = useRef<string | null>(null);
  const pickedPending = useRef<{ start: string; end: string } | null>(null);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !id || !ws || !clipper) return;
    restored.current = true;
    const saved = ws.tabs.find((t) => t.id === id);
    if (!saved?.url || clipper.url) return;
    pending.current = saved.url;
    // Loading the video's info clears the In and Out, so the saved pick goes back after it (B-11).
    pickedPending.current = saved.picked ?? null;
    store.restore(extractVideoId(saved.url), saved.segments ?? []);
    clipper.setUrl(saved.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // Report what the tab holds. Held back until a restore has landed, or the empty first
  // render would overwrite the saved work.
  useEffect(() => {
    if (!id || !ws || !clipper) return;
    if (pending.current !== null) {
      if (url !== pending.current) return;
      pending.current = null;
    }
    if (!restored.current) return;
    if (opened) ws.markOpened(id);
    // A link opening in the background that fails stays out of sight: the field says why.
    else if (url && openError && !loadingInfo) ws.failOpening(id, openError);
    if (pickedPending.current) {
      // The saved In/Out waits for the video's info; reporting now would overwrite it with nothing.
      if (!clipper.info) return;
      const { start, end } = pickedPending.current;
      pickedPending.current = null;
      clipper.setStartText(start);
      clipper.setEndText(end);
      return;
    }
    // A link that has not opened (still loading, or failed) is not saved as a video: the tab keeps
    // what it last held, so a private or mistyped link never turns up in the Videos list.
    if (url && !opened) return;
    ws.reportTabWork(id, { url, segments, picked: { start: startText, end: endText } });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, url, segments, startText, endText, clipper?.info, opened, openError, loadingInfo]);

  return null;
}

export function useIsTabActive(): boolean {
  return useContext(TabActiveContext);
}
