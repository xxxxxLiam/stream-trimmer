/**
 * File: looks.ts
 * Path: src/renderer/src/shared/utils/looks.ts
 * Description: Saved Final Cut looks. Every uploaded look goes into one list; a campaign stores only
 *   the id of the look it uses, so the same look is never uploaded twice. Pure functions plus a small
 *   store kept in the settings file. Migrates the old single pasted look (per-campaign lookXml and
 *   applyLook) into the list once.
 */
import { readSetting, writeSetting } from "./persist";

export type SavedLook = { id: string; name: string; xml: string };

export const LOOKS_KEY = "clipper.looks";

export function normalizeLooks(raw: unknown): SavedLook[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedLook[] = [];
  for (const r of raw) {
    const o = (r ?? {}) as Record<string, unknown>;
    if (typeof o.id === "string" && typeof o.xml === "string" && o.xml.trim()) {
      out.push({ id: o.id, name: typeof o.name === "string" && o.name.trim() ? o.name : "My look", xml: o.xml });
    }
  }
  return out;
}

/** "Acme look.fcpxml" reads as "Acme look". */
export function lookNameFromFile(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? "";
  return base.replace(/\.(fcpxmld|fcpxml|xml|txt)$/i, "").trim() || "My look";
}

const sameText = (a: string, b: string) => a.trim() === b.trim();

/** Add a look. The same text already saved is reused, so nothing is stored twice. */
export function addLook(list: readonly SavedLook[], name: string, xml: string): { list: SavedLook[]; id: string } {
  const hit = list.find((l) => sameText(l.xml, xml));
  if (hit) return { list: [...list], id: hit.id };
  let n = list.length + 1;
  while (list.some((l) => l.id === `look-${n}`)) n++;
  const id = `look-${n}`;
  return { list: [...list, { id, name: name.trim() || "My look", xml }], id };
}

/** A look can be deleted only when no campaign uses it. */
export function removeLook(list: readonly SavedLook[], id: string, usedIds: readonly (string | null | undefined)[]): SavedLook[] {
  return usedIds.includes(id) ? [...list] : list.filter((l) => l.id !== id);
}

/**
 * Old settings kept one pasted look per campaign (applyLook plus lookXml). Move each into the list and
 * give that campaign its id. Campaigns that already have a lookId, or no look, are left alone.
 */
export function migrateLooks(
  looks: readonly SavedLook[],
  perCampaign: Record<string, unknown>,
): { looks: SavedLook[]; perCampaign: Record<string, unknown>; changed: boolean } {
  let list = [...looks];
  const out: Record<string, unknown> = { ...perCampaign };
  let changed = false;
  for (const [cid, v] of Object.entries(perCampaign)) {
    const r = (v ?? {}) as Record<string, unknown>;
    if (typeof r.lookId === "string" || typeof r.lookXml !== "string" || !r.lookXml.trim()) continue;
    const added = addLook(list, "My look", r.lookXml);
    list = added.list;
    out[cid] = { ...r, lookId: r.applyLook === true ? added.id : null, lookXml: "", applyLook: false };
    changed = true;
  }
  return { looks: list, perCampaign: out, changed };
}

/** The Final Cut settings a campaign hands to the writer: its look's text, applied only when it has one. */
export function withResolvedLook<T extends { lookId?: string | null }>(settings: T, looks: readonly SavedLook[]): T & { applyLook: boolean; lookXml: string } {
  const look = settings.lookId ? looks.find((l) => l.id === settings.lookId) : undefined;
  return { ...settings, applyLook: !!look, lookXml: look?.xml ?? "" };
}

let current: SavedLook[] = normalizeLooks(readSetting<unknown>(LOOKS_KEY, []));
const listeners = new Set<() => void>();
export const looksStore = {
  get: () => current,
  subscribe: (l: () => void) => {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
  set(next: SavedLook[]) {
    current = next;
    writeSetting(LOOKS_KEY, next);
    listeners.forEach((l) => l());
  },
};
