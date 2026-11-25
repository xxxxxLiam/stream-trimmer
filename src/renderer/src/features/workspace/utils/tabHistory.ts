/**
 * File: tabHistory.ts
 * Path: src/renderer/src/features/workspace/utils/tabHistory.ts
 * Description: Where "Back" goes after a link that will not open, and what is saved. A video added
 *   from a pasted link remembers the video you were on and counts as "trying" until it has opened;
 *   a link that never opened is not saved and goes away on Back (B2-1).
 */
import type { WorkspaceTab } from "../hooks/WorkspaceContext";

export type CameFrom = Record<string, string>;
export type Trying = Record<string, true>;

/** The video "Back" returns to: the one this video was added from, if it is still there and open. */
export function backTarget(tabs: readonly WorkspaceTab[], cameFrom: CameFrom, id: string): string | null {
  const from = cameFrom[id];
  const t = from ? tabs.find((x) => x.id === from) : undefined;
  return t && !t.done && t.id !== id ? t.id : null;
}

/** What goes into settings.json: videos still trying to open are left out, and so is their active mark. */
export function savedWorkspace(
  tabs: readonly WorkspaceTab[],
  activeId: string,
  trying: Trying,
  cameFrom: CameFrom,
): { tabs: WorkspaceTab[]; activeId: string } {
  const kept = tabs.filter((t) => !trying[t.id]);
  if (kept.length === 0) return { tabs: [...tabs], activeId };
  if (kept.some((t) => t.id === activeId)) return { tabs: kept, activeId };
  const back = backTarget(kept, cameFrom, activeId);
  return { tabs: kept, activeId: back ?? kept[0].id };
}

/** Drop a video that never opened and say which one to show instead. */
export function abandon(
  tabs: readonly WorkspaceTab[],
  cameFrom: CameFrom,
  id: string,
): { tabs: WorkspaceTab[]; activeId: string | null } {
  const back = backTarget(tabs, cameFrom, id);
  const rest = tabs.filter((t) => t.id !== id);
  const fallback = rest.find((t) => !t.done) ?? rest[0];
  return { tabs: rest, activeId: back ?? fallback?.id ?? null };
}
