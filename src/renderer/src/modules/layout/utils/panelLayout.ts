/**
 * File: panelLayout.ts
 * Path: src/renderer/src/modules/layout/utils/panelLayout.ts
 * Description: The workspace layout as plain data, and every change to it as a pure function:
 *   which panels each group holds and shows, the group sizes, close and bring back, reset, and
 *   reading a saved layout safely. No React and no storage in here.
 */
import type { PanelDefinition, PanelGroupId, PanelId } from "./panelRegistry";

export type GroupState = { tabs: PanelId[]; active: PanelId | null };

export type PanelSizes = {
  /** Left group width, right group width, and the timeline's height, in px. */
  left: number;
  right: number;
  timeline: number;
};

export type PanelLayout = {
  groups: Record<PanelGroupId, GroupState>;
  sizes: PanelSizes;
};

export const DEFAULT_SIZES: PanelSizes = { left: 300, right: 300, timeline: 220 };

/** Resize limits. The centre keeps at least CENTRE_MIN_W whatever the sides are set to. */
export const SIZE_LIMITS = {
  left: { min: 220, max: 560 },
  right: { min: 260, max: 560 },
  timeline: { min: 120, max: 520 },
} as const;
export const CENTRE_MIN_W = 420;

export const LAYOUT_KEY = "clipper.panelLayout";
export const SAVED_LAYOUT_KEY = "clipper.panelLayout.saved";

const GROUPS: PanelGroupId[] = ["left", "centre", "right"];

/** The built-in arrangement: every registered panel in its own group, in registration order. */
export function defaultLayout(defs: PanelDefinition[]): PanelLayout {
  const groups = { left: empty(), centre: empty(), right: empty() };
  for (const d of defs) groups[d.group].tabs.push(d.id);
  for (const g of GROUPS) groups[g].active = groups[g].tabs[0] ?? null;
  return { groups, sizes: { ...DEFAULT_SIZES } };
}

function empty(): GroupState {
  return { tabs: [], active: null };
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

/** Panel ids that are registered but sit in no group: the closed ones. */
export function closedPanels(layout: PanelLayout, defs: PanelDefinition[]): PanelDefinition[] {
  const open = new Set(GROUPS.flatMap((g) => layout.groups[g].tabs));
  return defs.filter((d) => !open.has(d.id));
}

export function groupOf(layout: PanelLayout, id: PanelId): PanelGroupId | null {
  return GROUPS.find((g) => layout.groups[g].tabs.includes(id)) ?? null;
}

export function isOpen(layout: PanelLayout, id: PanelId): boolean {
  return groupOf(layout, id) !== null;
}

function withGroup(layout: PanelLayout, g: PanelGroupId, next: GroupState): PanelLayout {
  return { ...layout, groups: { ...layout.groups, [g]: next } };
}

/** Show a tab: it becomes the group's active one. */
export function activatePanel(layout: PanelLayout, id: PanelId): PanelLayout {
  const g = groupOf(layout, id);
  if (!g || layout.groups[g].active === id) return layout;
  return withGroup(layout, g, { ...layout.groups[g], active: id });
}

/** Close a panel. The group shows its neighbour (the tab to the right, else to the left). */
export function closePanel(layout: PanelLayout, id: PanelId): PanelLayout {
  const g = groupOf(layout, id);
  if (!g) return layout;
  const { tabs, active } = layout.groups[g];
  const at = tabs.indexOf(id);
  const rest = tabs.filter((t) => t !== id);
  const nextActive = active === id ? (rest[at] ?? rest[at - 1] ?? null) : active;
  return withGroup(layout, g, { tabs: rest, active: nextActive });
}

/** Bring a closed panel back into its home group and show it. An open one is just shown. */
export function openPanel(layout: PanelLayout, def: PanelDefinition): PanelLayout {
  if (isOpen(layout, def.id)) return activatePanel(layout, def.id);
  const cur = layout.groups[def.group];
  return withGroup(layout, def.group, { tabs: [...cur.tabs, def.id], active: def.id });
}

/** Panels menu: a tick toggles a panel closed or open. */
export function togglePanel(layout: PanelLayout, def: PanelDefinition): PanelLayout {
  return isOpen(layout, def.id) ? closePanel(layout, def.id) : openPanel(layout, def);
}

/** Move a tab one place left or right inside its group (keyboard route to reorder). */
export function moveTab(layout: PanelLayout, id: PanelId, by: -1 | 1): PanelLayout {
  const g = groupOf(layout, id);
  if (!g) return layout;
  const tabs = [...layout.groups[g].tabs];
  const from = tabs.indexOf(id);
  const to = from + by;
  if (to < 0 || to >= tabs.length) return layout;
  tabs.splice(to, 0, tabs.splice(from, 1)[0]);
  return withGroup(layout, g, { ...layout.groups[g], tabs });
}

/** Set one size, clamped to its limit and, for the sides, to what leaves the centre its minimum. */
export function resizeGroup(
  layout: PanelLayout,
  key: keyof PanelSizes,
  px: number,
  containerWidth = Infinity,
): PanelLayout {
  const lim = SIZE_LIMITS[key];
  let max: number = lim.max;
  if (key === "left") max = Math.min(max, containerWidth - layout.sizes.right - CENTRE_MIN_W);
  if (key === "right") max = Math.min(max, containerWidth - layout.sizes.left - CENTRE_MIN_W);
  const value = Math.round(clamp(px, lim.min, Math.max(lim.min, max)));
  if (layout.sizes[key] === value) return layout;
  return { ...layout, sizes: { ...layout.sizes, [key]: value } };
}

function isGroupState(v: unknown): v is GroupState {
  if (!v || typeof v !== "object") return false;
  const g = v as GroupState;
  return Array.isArray(g.tabs) && g.tabs.every((t) => typeof t === "string");
}

/**
 * Turn whatever was stored into a valid layout for the panels registered now. Unknown ids are
 * dropped, a panel seen for the first time (a new release added it) joins its home group, and a
 * panel the user closed stays closed. `known` is the ids the stored layout already knew about.
 */
export function normalizeLayout(raw: unknown, defs: PanelDefinition[]): PanelLayout {
  const base = defaultLayout(defs);
  if (!raw || typeof raw !== "object") return base;
  const r = raw as { groups?: Record<string, unknown>; sizes?: Partial<PanelSizes>; known?: unknown };
  if (!r.groups) return base;
  const ids = new Set(defs.map((d) => d.id));
  const placed = new Set<PanelId>();
  const groups = { left: empty(), centre: empty(), right: empty() };
  for (const g of GROUPS) {
    const stored = r.groups[g];
    if (!isGroupState(stored)) continue;
    const tabs = stored.tabs.filter((t) => ids.has(t) && !placed.has(t));
    tabs.forEach((t) => placed.add(t));
    groups[g] = { tabs, active: stored.active && tabs.includes(stored.active) ? stored.active : (tabs[0] ?? null) };
  }
  const known = new Set(Array.isArray(r.known) ? (r.known as unknown[]).filter((k): k is string => typeof k === "string") : []);
  for (const d of defs) {
    if (placed.has(d.id) || known.has(d.id)) continue; // closed on purpose, or already placed
    groups[d.group].tabs.push(d.id);
    groups[d.group].active ??= d.id;
  }
  const sizes = { ...DEFAULT_SIZES };
  for (const k of Object.keys(sizes) as (keyof PanelSizes)[]) {
    const v = r.sizes?.[k];
    if (typeof v === "number" && Number.isFinite(v)) sizes[k] = clamp(v, SIZE_LIMITS[k].min, SIZE_LIMITS[k].max);
  }
  return { groups, sizes };
}

/** What gets written: the layout plus every panel id it has seen, so a closed one stays closed. */
export function serializeLayout(layout: PanelLayout, defs: PanelDefinition[]) {
  return { ...layout, known: defs.map((d) => d.id) };
}
