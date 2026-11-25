/**
 * File: usePanelLayoutState.ts
 * Path: src/renderer/src/modules/layout/hooks/usePanelLayoutState.ts
 * Description: The one workspace layout, shared by every part of the shell. A module-level store
 *   (not component state) so the tab strips, the Panels menu and the top bar all read and change
 *   the same arrangement. The current layout is saved as you go. "Save layout" keeps a copy as
 *   your own arrangement; "Reset layout" goes back to the built-in one.
 */
import { useCallback, useSyncExternalStore } from "react";
import { readSetting, writeSetting } from "../../../shared/utils/persist";
import {
  LAYOUT_KEY,
  SAVED_LAYOUT_KEY,
  activatePanel,
  closePanel,
  defaultLayout,
  moveTab,
  movePanelToGroup,
  normalizeLayout,
  openPanel,
  resizeGroup,
  serializeLayout,
  togglePanel,
  type PanelLayout,
  type PanelSizes,
} from "../utils/panelLayout";
import {
  getPanel,
  listPanels,
  panelsVersion,
  subscribePanels,
  type PanelDefinition,
  type PanelId,
} from "../utils/panelRegistry";

let layout: PanelLayout | null = null;
let layoutForVersion = -1;
const listeners = new Set<() => void>();

function current(): PanelLayout {
  const v = panelsVersion();
  if (!layout || layoutForVersion !== v) {
    // First read, or a panel was (re)registered: read the saved layout against what exists now.
    layout = normalizeLayout(layout ? serializeLayout(layout, knownBefore) : readSetting<unknown>(LAYOUT_KEY, null), listPanels());
    layoutForVersion = v;
    knownBefore = listPanels();
  }
  return layout;
}
let knownBefore: PanelDefinition[] = [];

function set(next: PanelLayout, persist = true) {
  if (next === layout) return;
  layout = next;
  layoutForVersion = panelsVersion();
  knownBefore = listPanels();
  if (persist) writeSetting(LAYOUT_KEY, serializeLayout(next, knownBefore));
  for (const l of listeners) l();
}

function subscribe(l: () => void) {
  listeners.add(l);
  const off = subscribePanels(l);
  return () => {
    listeners.delete(l);
    off();
  };
}

/** Reset to the built-in layout. */
export function resetPanelLayout() {
  set(defaultLayout(listPanels()));
}

/** Keep the current arrangement as the user's own. */
export function savePanelLayout() {
  writeSetting(SAVED_LAYOUT_KEY, serializeLayout(current(), listPanels()));
}

/** True once "Save layout" has been used, so the menu can offer to go back to it. */
export function hasSavedPanelLayout(): boolean {
  return readSetting<unknown>(SAVED_LAYOUT_KEY, null) !== null;
}

/** Go back to the layout kept with "Save layout". */
export function restoreSavedPanelLayout() {
  const saved = readSetting<unknown>(SAVED_LAYOUT_KEY, null);
  if (saved) set(normalizeLayout(saved, listPanels()));
}

/** Tests only: forget the in-memory layout so the next read starts from storage again. */
export function forgetPanelLayoutForTest() {
  layout = null;
  layoutForVersion = -1;
}

/**
 * Resize one group. A drag calls this with persist false while moving and persist true at the end:
 * the end of a drag finds the size already in place, so set() sees no change and writes nothing;
 * the layout is therefore saved here.
 */
export function resizePanel(key: keyof PanelSizes, px: number, containerWidth?: number, persist = true) {
  set(resizeGroup(current(), key, px, containerWidth), persist);
  if (persist) writeSetting(LAYOUT_KEY, serializeLayout(current(), listPanels()));
}

export function usePanelLayoutState() {
  const snapshot = useSyncExternalStore(subscribe, current, current);
  const panels = listPanels();
  return {
    layout: snapshot,
    panels,
    activate: useCallback((id: PanelId) => set(activatePanel(current(), id)), []),
    close: useCallback((id: PanelId) => set(closePanel(current(), id)), []),
    open: useCallback((id: PanelId) => {
      const def = getPanel(id);
      if (def) set(openPanel(current(), def));
    }, []),
    toggle: useCallback((id: PanelId) => {
      const def = getPanel(id);
      if (def) set(togglePanel(current(), def));
    }, []),
    move: useCallback((id: PanelId, by: -1 | 1) => set(moveTab(current(), id, by)), []),
    moveToGroup: useCallback((id: PanelId, to: "left" | "right", index?: number) => set(movePanelToGroup(current(), id, to, index)), []),
    resize: resizePanel,
    /** Write the current layout once a drag ends (drags call resize with persist false). */
    commit: useCallback(() => writeSetting(LAYOUT_KEY, serializeLayout(current(), listPanels())), []),
    reset: resetPanelLayout,
    save: savePanelLayout,
  };
}
