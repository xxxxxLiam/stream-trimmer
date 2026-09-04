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
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { readSetting, writeSetting } from "../lib/persist";

const STORE_KEY = "clipper.workspaces";
const DEFAULT_TAB_NAME = "New tab";

export type WorkspaceTab = {
  id: string;
  /** User-assigned name; empty means "use the auto title". */
  name: string;
};

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
  const tabs = raw.tabs
    .filter((t) => t && typeof t.id === "string")
    .map((t) => ({ id: t.id, name: typeof t.name === "string" ? t.name : "" }));
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

export function TabActiveProvider({
  active,
  children,
}: {
  active: boolean;
  children: ReactNode;
}) {
  return (
    <TabActiveContext.Provider value={active}>
      {children}
    </TabActiveContext.Provider>
  );
}

export function useIsTabActive(): boolean {
  return useContext(TabActiveContext);
}
