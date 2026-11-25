/**
 * File: fcpLooks.ts
 * Path: src/renderer/src/shared/utils/fcpLooks.ts
 * Description: The saved Final Cut looks. Every uploaded look is kept once in one list, and a campaign keeps
 *   only the id of the look it uses, so a look uploaded for one campaign can be picked for another. The
 *   look is kept parsed (see common/utils/fcpLook.ts), not as the export's whole text. Pure; persistence is below.
 */
import type { FcpLookFileResult } from "../../../../common/types/fcpLook";
import { parseLook, type Look } from "../../../../common/utils/fcpLook";
import { readSetting, writeSetting } from "./persist";
import type { Campaign } from "./campaigns";

export type SavedLook = {
  id: string;
  /** Taken from the file name, "Acme grade". Shown in the campaign form's look menu. */
  name: string;
  look: Look;
  /** When it was added (ms since epoch). */
  addedAt: number;
};

export const KEY_LOOKS = "clipper.fcpLooks";
export const KEY_LOOK_MIGRATED = "clipper.fcpLookMigrated";
/** What the old single pasted look is called once it is in the list. */
export const MIGRATED_NAME = "My look";

const isStrings = (v: unknown): v is string[] => Array.isArray(v) && v.every((x) => typeof x === "string");

/** Defensive read of the stored list; a malformed entry is dropped rather than half used. */
export function normalizeSavedLooks(raw: unknown): SavedLook[] {
  if (!Array.isArray(raw)) return [];
  const out: SavedLook[] = [];
  for (const item of raw) {
    const r = item as Record<string, unknown> | null;
    const l = r?.look as Record<string, unknown> | undefined;
    if (!r || typeof r.id !== "string" || !r.id || typeof r.name !== "string") continue;
    if (!l || typeof l.version !== "string" || typeof l.clip !== "string" || !isStrings(l.effects) || !isStrings(l.found)) continue;
    if (out.some((x) => x.id === r.id)) continue;
    out.push({
      id: r.id,
      name: r.name,
      look: { version: l.version, clip: l.clip, effects: l.effects, found: l.found },
      addedAt: typeof r.addedAt === "number" && Number.isFinite(r.addedAt) ? r.addedAt : 0,
    });
  }
  return out;
}

/** "Acme grade.fcpxmld" -> "Acme grade". */
export function lookNameFromFile(fileName: string): string {
  const name = fileName.replace(/\.(fcpxmld|fcpxml|txt|xml)$/i, "").trim();
  return name || "My look";
}

function uniqueLookName(list: readonly SavedLook[], name: string): string {
  const taken = new Set(list.map((l) => l.name.toLowerCase()));
  if (!taken.has(name.toLowerCase())) return name;
  let n = 2;
  while (taken.has(`${name} ${n}`.toLowerCase())) n += 1;
  return `${name} ${n}`;
}

export function newLookId(): string {
  const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto;
  const raw = typeof c?.randomUUID === "function" ? c.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
  return `l-${raw.replace(/-/g, "").slice(0, 12)}`;
}

/** Adds a look to the list; the name is the file's, made different from every other look's. */
export function addSavedLook(
  list: readonly SavedLook[],
  input: { fileName: string; look: Look },
  now: number = Date.now(),
  makeId: () => string = newLookId,
): { looks: SavedLook[]; saved: SavedLook } {
  const saved: SavedLook = { id: makeId(), name: uniqueLookName(list, lookNameFromFile(input.fileName)), look: input.look, addedAt: now };
  return { looks: [...list, saved], saved };
}

/** Deleting a look is refused while any campaign uses it; the refusal names those campaigns. */
export function deleteSavedLook(
  list: readonly SavedLook[],
  campaigns: readonly Campaign[],
  id: string,
): { ok: true; looks: SavedLook[] } | { ok: false; usedBy: string[] } {
  const usedBy = campaigns.filter((c) => c.fcpLookId === id).map((c) => c.name);
  if (usedBy.length > 0) return { ok: false, usedBy };
  return { ok: true, looks: list.filter((l) => l.id !== id) };
}

/** The look to write into a campaign's Final Cut projects, or undefined for none. */
export function lookForCampaign(campaign: Pick<Campaign, "fcpLookId"> | undefined, looks: readonly SavedLook[]): Look | undefined {
  if (!campaign?.fcpLookId) return undefined;
  return looks.find((l) => l.id === campaign.fcpLookId)?.look;
}

/**
 * One time: today's single pasted look becomes the saved look "My look", and every campaign that had
 * "Apply my look" on points to it. A switched-off look is still kept in the list. A pasted text that no
 * longer parses is left where it is and nothing is marked migrated, so it is not lost either.
 */
export function migratePastedLook(
  campaigns: readonly Campaign[],
  looks: readonly SavedLook[],
  legacy: { applyLook?: boolean; lookXml?: string },
  now: number = Date.now(),
  makeId: () => string = newLookId,
): { campaigns: Campaign[]; looks: SavedLook[]; migrated: boolean } {
  const text = (legacy.lookXml ?? "").trim();
  if (!text) return { campaigns: [...campaigns], looks: [...looks], migrated: true };
  let look: Look;
  try {
    look = parseLook(text);
  } catch {
    return { campaigns: [...campaigns], looks: [...looks], migrated: false };
  }
  const { looks: next, saved } = addSavedLook(looks, { fileName: MIGRATED_NAME, look }, now, makeId);
  const point = legacy.applyLook === true;
  return {
    campaigns: campaigns.map((c) => (point && !c.fcpLookId ? { ...c, fcpLookId: saved.id } : c)),
    looks: next,
    migrated: true,
  };
}

// ---- persistence ------------------------------------------------------------------------

export function loadSavedLooks(): SavedLook[] {
  return normalizeSavedLooks(readSetting<unknown>(KEY_LOOKS, []));
}

export function saveSavedLooks(looks: readonly SavedLook[]): void {
  writeSetting(KEY_LOOKS, looks);
}

/**
 * The result of choosing or dropping a file (see `pickFinalCutLook`): added to the saved looks, and the
 * new look's id comes back for the campaign to point at. A refused file comes back as its one sentence.
 */
export function addPickedLook(result: FcpLookFileResult): { ok: true; id: string; name: string } | { ok: false; reason: string; cancelled?: boolean } {
  if (!result.ok) return { ok: false, reason: result.reason, ...(result.cancelled ? { cancelled: true } : {}) };
  const { looks, saved } = addSavedLook(loadSavedLooks(), { fileName: result.fileName, look: result.look });
  saveSavedLooks(looks);
  return { ok: true, id: saved.id, name: saved.name };
}
