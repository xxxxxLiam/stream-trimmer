/**
 * File: copyListStore.ts
 * Path: src/renderer/src/modules/layout/hooks/copyListStore.ts
 * Description: What the open panel can copy out as text (Export and History ··· menus). A panel says how
 *   many clips it would copy and how to write them; the menu reads it when it opens. Keyed by panel id.
 */
import { useEffect, useRef, useSyncExternalStore } from "react";
import { useIsTabActive } from "../../../features/workspace/hooks/WorkspaceContext";

export type CopyList = {
  count: number;
  /** The text, written when it is asked for, never on every render. */
  text: () => string | Promise<string>;
  fileName: () => string;
  /** The dim line under the disabled items when there is nothing to copy. */
  emptyNote: string;
};

const sources = new Map<string, CopyList>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
// A snapshot that changes only when a registration does, so the store reads are stable.
let version = 0;

export function registerCopyList(id: string, list: CopyList | null) {
  if (list) sources.set(id, list);
  else sources.delete(id);
  version++;
  emit();
}

export const getCopyList = (id: string): CopyList | undefined => sources.get(id);

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

/** The registered list for a panel (undefined when that panel offers none). Re-reads when it changes. */
export function useCopyListFor(id: string | undefined): CopyList | undefined {
  useSyncExternalStore(subscribe, () => version, () => 0);
  return id ? sources.get(id) : undefined;
}

/** A panel offers its list: the count is read live, the text only when copied. */
export function useCopyListSource(id: string, list: { count: number; text: () => string | Promise<string>; fileName: () => string; emptyNote: string }) {
  const latest = useRef(list);
  latest.current = list;
  // Every workspace tab renders its own panels; only the tab in front owns the menu's list.
  const active = useIsTabActive();
  useEffect(() => {
    if (!active) return;
    registerCopyList(id, { count: list.count, emptyNote: list.emptyNote, text: () => latest.current.text(), fileName: () => latest.current.fileName() });
    return () => registerCopyList(id, null);
  }, [id, active, list.count, list.emptyNote]);
}
