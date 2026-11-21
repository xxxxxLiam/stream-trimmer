/**
 * File: WorkspaceContext.tsx
 * Path: src/context/WorkspaceContext.tsx
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
import { readSetting, writeSetting } from "../lib/persist";
import { extractVideoId } from "../lib/clip";
import type { Segment } from "../lib/segments";
import { useClipperContext } from "./ClipperContext";
import {
  SegmentStoreContext,
  createSegmentStore,
  setActiveSegmentStore,
  useSegments,
  type SegmentStore,
} from "../hooks/useSegments";

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
};

/** How many closed tabs Ctrl+Shift+T can bring back. */
const CLOSED_LIMIT = 10;
type ClosedTab = { tab: WorkspaceTab; index: number };

function cleanTab(t: WorkspaceTab): WorkspaceTab {
  const out: WorkspaceTab = { id: t.id, name: typeof t.name === "string" ? t.name : "" };
  if (typeof t.url === "string" && t.url) out.url = t.url;
  if (Array.isArray(t.segments)) {
    const segs = t.segments.filter(
      (s) => s && Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start,
    );
    if (segs.length) out.segments = segs.map((s) => ({ start: s.start, end: s.end }));
  }
  return out;
}

type TabMeta = { title: string; busy: boolean };

type PersistedState = { tabs: WorkspaceTab[]; activeId: string };

function newId(): string {
  return `ws_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
}

function loadState(): PersistedState {
  const fallback = (): PersistedState => {
    const id = newId();
    return { tabs: [{ id, name: "" }], activeId: id };
  };
  const raw = readSetting<PersistedState | null>(STORE_KEY, null);
  if (!raw || !Array.isArray(raw.tabs) || raw.tabs.length === 0)
    return fallback();
  const tabs = raw.tabs.filter((t) => t && typeof t.id === "string").map(cleanTab);
  if (tabs.length === 0) return fallback();
  const activeId = tabs.some((t) => t.id === raw.activeId)
    ? raw.activeId
    : tabs[0].id;
  return { tabs, activeId };
}

export type WorkspaceState = {
  tabs: WorkspaceTab[];
  activeId: string;
  meta: Record<string, TabMeta>;
  labelFor: (id: string) => string;
  selectTab: (id: string) => void;
  addTab: () => void;
  closeTab: (id: string) => void;
  renameTab: (id: string, name: string) => void;
  /** Bring back the most recently closed tab (Ctrl/Cmd+Shift+T). Returns false when none. */
  reopenTab: () => boolean;
  closedCount: number;
  /** A tab reports what it holds so a relaunch or reopen can restore it. */
  reportTabWork: (id: string, work: { url: string; segments: readonly Segment[] }) => void;
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

  useEffect(() => {
    writeSetting(STORE_KEY, { tabs, activeId });
  }, [tabs, activeId]);

  const selectTab = useCallback((id: string) => setActiveId(id), []);

  const addTab = useCallback(() => {
    const id = newId();
    setTabs((prev) => [...prev, { id, name: "" }]);
    setActiveId(id);
  }, []);

  const closeTab = useCallback(
    (id: string) => {
      const busy = meta[id]?.busy;
      if (busy) {
        const ok =
          typeof window === "undefined" ||
          window.confirm(
            "This tab has a job running. Closing it will cancel that job. Continue?",
          );
        if (!ok) return;
        cancels.current.get(id)?.();
      }
      const closingIndex = tabsRef.current.findIndex((t) => t.id === id);
      const closing = tabsRef.current[closingIndex];
      if (closing && !busy) {
        const work = closing.segments?.length ?? 0;
        if (
          work > 0 &&
          typeof window !== "undefined" &&
          !window.confirm(
            `This tab has ${work} marked segment${work === 1 ? "" : "s"} that have not been cut. Close it anyway? Ctrl+Shift+T brings it back.`,
          )
        )
          return;
      }
      if (closing && (closing.url || closing.segments?.length)) {
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
      setTabs((prev) => {
        const remaining = prev.filter((t) => t.id !== id);
        if (remaining.length === 0) {
          const fresh = { id: newId(), name: "" };
          setActiveId(fresh.id);
          return [fresh];
        }
        setActiveId((current) => {
          if (current !== id) return current;
          const index = prev.findIndex((t) => t.id === id);
          return (remaining[index] ?? remaining[remaining.length - 1]).id;
        });
        return remaining;
      });
    },
    [meta],
  );

  const renameTab = useCallback((id: string, name: string) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, name: name.trim() } : t)),
    );
  }, []);

  const reportTabWork = useCallback<WorkspaceState["reportTabWork"]>((id, work) => {
    setTabs((prev) => {
      let changed = false;
      const next = prev.map((t) => {
        if (t.id !== id) return t;
        const url = work.url || undefined;
        const a = t.segments ?? [];
        const same =
          t.url === url &&
          a.length === work.segments.length &&
          a.every((s, i) => s.start === work.segments[i].start && s.end === work.segments[i].end);
        if (same) return t;
        changed = true;
        return cleanTab({ id: t.id, name: t.name, url, segments: work.segments as Segment[] });
      });
      return changed ? next : prev;
    });
  }, []);

  const reopenTab = useCallback((): boolean => {
    const [last, ...rest] = closedRef.current;
    if (!last) return false;
    setClosed(rest);
    setTabs((prev) => {
      if (prev.some((t) => t.id === last.tab.id)) return prev;
      const next = [...prev];
      next.splice(Math.min(last.index, next.length), 0, last.tab);
      return next;
    });
    setActiveId(last.tab.id);
    return true;
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "t") {
        if (closedRef.current.length === 0) return;
        e.preventDefault();
        reopenTab();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [reopenTab]);

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
      closeTab,
      renameTab,
      reopenTab,
      closedCount: closed.length,
      reportTabWork,
      reportTab,
    }),
    [
      tabs,
      activeId,
      meta,
      labelFor,
      selectTab,
      addTab,
      closeTab,
      renameTab,
      reopenTab,
      closed.length,
      reportTabWork,
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
  const { segments } = useSegments();
  const id = tabId ?? (active ? ws?.activeId : undefined);
  const url = clipper?.url ?? "";
  const downloading = clipper?.downloading ?? false;

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
    ws.reportTabWork(id, { url, segments });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, url, segments]);

  return null;
}

export function useIsTabActive(): boolean {
  return useContext(TabActiveContext);
}
