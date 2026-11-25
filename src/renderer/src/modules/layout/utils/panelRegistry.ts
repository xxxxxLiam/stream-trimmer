/**
 * File: panelRegistry.ts
 * Path: src/renderer/src/modules/layout/utils/panelRegistry.ts
 * Description: The panel slot API. A feature registers a panel once, at import time, and the
 *   shell mounts it in whichever group the user has it in. No shell file needs editing to add
 *   or replace a panel: registering an id again replaces the earlier one.
 */
import type { ComponentType } from "react";

/** The three places a panel can live. Left and right are tabbed; the centre stacks Preview over Timeline. */
export type PanelGroupId = "left" | "centre" | "right";

export type PanelId = string;

export type PanelDefinition = {
  /** Stable id, saved in the user's layout. Lower-case words, e.g. "videos". */
  id: PanelId;
  /** The tab label and the Panels menu row. */
  title: string;
  /** Where it sits at first, and where "Reset layout" and "reopen" put it. */
  group: PanelGroupId;
  /** The body. Takes no props: read feature state from contexts and the shell's usePanelHost(). */
  component: ComponentType;
  /** False for panels that cannot be closed. Default true. */
  closable?: boolean;
};

const panels = new Map<PanelId, PanelDefinition>();
/** Bumped on every change so the layout store can re-read the list. */
let version = 0;
const listeners = new Set<() => void>();

/** Add a panel, or replace the one with the same id. Returns the id. */
export function registerPanel(def: PanelDefinition): PanelId {
  panels.set(def.id, { closable: true, ...def });
  version += 1;
  for (const l of listeners) l();
  return def.id;
}

export function getPanel(id: PanelId): PanelDefinition | undefined {
  return panels.get(id);
}

/** Every registered panel in registration order. */
export function listPanels(): PanelDefinition[] {
  return [...panels.values()];
}

export function panelsVersion(): number {
  return version;
}

export function subscribePanels(l: () => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** Tests only. */
export function clearPanelsForTest(): void {
  panels.clear();
  version += 1;
}
