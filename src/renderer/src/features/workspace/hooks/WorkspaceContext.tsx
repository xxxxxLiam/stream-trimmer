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
import { activeAfterClose, indexForDigit, moveItem, stepIndex } from "../../../shared/utils/tabOps";

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
};

/** How many closed tabs Ctrl+Shift+T can bring back. */
const CLOSED_LIMIT = 10;

export type ClosedTab = { tab: WorkspaceTab; index: number };

export function cleanTab(t: WorkspaceTab): WorkspaceTab {
  const out: WorkspaceTab = { id: t.id, name: typeof t.name === "string" ? t.name : "" };
  if (typeof t.url === "string" && t.url) out.url = t.url;
  if (typeof t.campaignId === "string" && t.campaignId) out.campaignId = t.campaignId;
  if (t.done === true) out.done = true;
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
  work: { url: string; segments: readonly Segment[] },
): WorkspaceTab[] {
  let changed = false;
  const next = tabs.map((t) => {
    if (t.id !== id) return t;
    const url = work.url || undefined;
    const a = t.segments ?? [];
    const same =
      t.url === url &&
      a.length === work.segments.length &&
      a.every((s, i) => s.start === work.segments[i].start && s.end === work.segments[i].end);
    if (same) return t;
    changed = true;
    return cleanTab({
      id: t.id,
      name: t.name,
      url,
      segments: work.segments as Segment[],
      campaignId: t.campaignId,
      done: t.done,
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
  /** Fold a video into Done, or bring it back. Marking the open one moves to the next open video. */
  setTabDone: (id: string, done: boolean) => void;
  /** Close a tab. False when the user backed out of the confirmation and nothing closed. */
  closeTab: (id: string) => boolean;
  /** Put tab `id` at `toIndex` (drag, or the keyboard move). */
  moveTab: (id: string, toIndex: number) => void;
  renameTab: (id: string, name: string) => void;
  /** Bring back the most recently closed tab (Ctrl/Cmd+Shift+T). Returns false when none. */
  reopenTab: () => boolean;
  closedCount: number;
  /** A tab reports what it holds so a relaunch or reopen can restore it. */
  reportTabWork: (id: string, work: { url: string; segments: readonly Segment[] }) => void;
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

  useEffect(() => {
    writeSetting(STORE_KEY, { tabs, activeId });
  }, [tabs, activeId]);

  const selectTab = useCallback((id: string) => setActiveId(id), []);

  const addTab = useCallback((url?: string) => {
    const id = newId();
    const link = typeof url === "string" ? url.trim() : "";
    setTabs((prev) => [...prev, link ? { id, name: "", url: link } : { id, name: "" }]);
    setActiveId(id);
  }, []);

  const setTabDone = useCallback((id: string, done: boolean) => {
    const current = tabsRef.current;
    setTabs(setDone(current, id, done));
    if (done && activeRef.current === id) {
      const next = nextOpenId(current, id);
      if (next) setActiveId(next);
    }
  }, []);

  const closeTab = useCallback(
    (id: string): boolean => {
      const busy = metaRef.current[id]?.busy;
      if (busy) {
        const ok =
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
          work > 0 &&
          typeof window !== "undefined" &&
          !window.confirm(
            `This tab has ${work} marked segment${work === 1 ? "" : "s"} that have not been cut. Close it anyway? Ctrl+Shift+T brings it back.`,
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

  const reopenTab = useCallback((): boolean => {
    const [last, ...rest] = closedRef.current;
    if (!last) return false;
    setClosed(rest);
    setTabs((prev) => reinsertTab(prev, last));
    setActiveId(last.tab.id);
    return true;
  }, []);

  const addTabRef = useRef(addTab);
  addTabRef.current = addTab;
  const closeTabRef = useRef(closeTab);
  closeTabRef.current = closeTab;

  // Browser tab shortcuts. Cmd on macOS, Ctrl elsewhere; Alt-modified chords are left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey) return;
      const ids = tabsRef.current.map((t) => t.id);
      const k = e.key.toLowerCase();
      if (k === "t") {
        if (e.shiftKey) {
          if (closedRef.current.length === 0) return;
          e.preventDefault();
          reopenTab();
        } else {
          e.preventDefault();
          if (!e.repeat) addTabRef.current();
        }
      } else if (k === "w" && !e.shiftKey) {
        e.preventDefault();
        if (!e.repeat) closeTabRef.current(activeRef.current);
      } else if (!e.shiftKey && /^[1-9]$/.test(k)) {
        const i = indexForDigit(Number(k), ids.length);
        if (i === null) return;
        e.preventDefault();
        setActiveId(ids[i]);
      } else if (k === "tab" || (!e.shiftKey && (k === "pagedown" || k === "pageup"))) {
        const back = k === "pageup" || (k === "tab" && e.shiftKey);
        e.preventDefault();
        const at = ids.indexOf(activeRef.current);
        setActiveId(ids[stepIndex(at, back ? -1 : 1, ids.length)]);
      } else if (e.shiftKey && (k === "pagedown" || k === "pageup")) {
        // Chrome's chord for moving the current tab along the strip.
        e.preventDefault();
        const at = ids.indexOf(activeRef.current);
        moveTab(activeRef.current, at + (k === "pageup" ? -1 : 1));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reopenTab, moveTab]);

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
  const downloading = clipper?.downloading ?? false;
  const opened = !!clipper?.info;

  // A cut works on a snapshot of the list, so editing it mid-cut would not reach the file.
  useLayoutEffect(() => {
    store.setLocked(downloading);
  }, [store, downloading]);

  // Restore once, on mount, from what this tab last reported.
  const pending = useRef<string | null>(null);
  const restored = useRef(false);
  useEffect(() => {
    if (restored.current || !id || !ws || !clipper) return;
    restored.current = true;
    const saved = ws.tabs.find((t) => t.id === id);
    if (!saved?.url || clipper.url) return;
    pending.current = saved.url;
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
    // A link that has not opened (still loading, or failed) is not saved as a video: the tab keeps
    // what it last held, so a private or mistyped link never turns up in the Videos list.
    if (url && !opened) return;
    ws.reportTabWork(id, { url, segments });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, url, segments, opened]);

  return null;
}

export function useIsTabActive(): boolean {
  return useContext(TabActiveContext);
}
