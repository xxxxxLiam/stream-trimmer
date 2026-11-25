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
/** Campaigns (or "*" for the flat old shape) whose switched-on old pasted look could not be read; the look row says so. */
export const KEY_LOOK_UNREAD = "clipper.fcpLookUnread";
/** The look picked or uploaded last, which a new campaign starts with. */
export const KEY_LAST_LOOK = "clipper.fcpLastLookId";
/** What the old single pasted look is called once it is in the list. */
export const MIGRATED_NAME = "My look";

/** The look's own frame size and rate, when stored and sane; anything else is left out. */
function readFormat(v: unknown): SavedLook["look"]["format"] {
  const f = v as Record<string, unknown> | null | undefined;
  return f && typeof f.width === "number" && f.width > 0 && typeof f.height === "number" && f.height > 0 && typeof f.fps === "string" && f.fps !== ""
    ? { width: f.width, height: f.height, fps: f.fps }
    : undefined;
}

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
      look: { version: l.version, clip: l.clip, effects: l.effects, found: l.found, ...(readFormat(l.format) ? { format: readFormat(l.format) } : {}) },
      addedAt: typeof r.addedAt === "number" && Number.isFinite(r.addedAt) ? r.addedAt : 0,
    });
  }
  return out;
}

/**
 * "Acme grade.fcpxmld" -> "Acme grade"; "TextEdit copy.rtf" -> "My look" (the extension, the " copy" the Mac adds
 * and a bare app or document name say nothing about the look); a file with no name of its own is "My look".
 */
export function lookNameFromFile(fileName: string): string {
  const name = fileName
    .replace(/\.(fcpxmld|fcpxml|txt|xml|rtf)$/i, "")
    .replace(/\s+copy(\s+\d+)?$/i, "")
    .trim();
  return !name || /^(textedit|untitled|document|new document)$/i.test(name) ? "My look" : name;
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

const sameLook = (a: Look, b: Look): boolean => a.version === b.version && a.clip === b.clip && JSON.stringify(a.effects) === JSON.stringify(b.effects);

/** Adds a look to the list; the name is the file's, made different from every other look's. */
export function addSavedLook(
  list: readonly SavedLook[],
  input: { fileName: string; look: Look },
  now: number = Date.now(),
  makeId: () => string = newLookId,
): { looks: SavedLook[]; saved: SavedLook } {
  // The same file again is the same look: reuse it rather than saving "Acme grade 2".
  const same = list.find((l) => sameLook(l.look, input.look));
  if (same) {
    // D3-1: a look saved before its size was read gains it when the same file is chosen again, instead of being skipped.
    if (!same.look.format && input.look.format) {
      const upgraded: SavedLook = { ...same, look: { ...same.look, format: input.look.format } };
      return { looks: list.map((l) => (l.id === same.id ? upgraded : l)), saved: upgraded };
    }
    return { looks: [...list], saved: same };
  }
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

type LegacyEntry = { applyLook?: boolean; lookXml?: string };

/**
 * The old pasted looks in `clipper.editorHandoff`, in both shapes the app has stored: one entry per
 * campaign ({ <campaignId>: { applyLook, lookXml } }, what real installs hold) and the flat single entry
 * ({ applyLook, lookXml }). Entries without text are skipped.
 */
export function legacyLookEntries(raw: unknown): { campaignId: string | null; apply: boolean; text: string }[] {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
  const o = raw as Record<string, unknown>;
  const entry = (v: unknown): { apply: boolean; text: string } | null => {
    if (!v || typeof v !== "object") return null;
    const e = v as LegacyEntry;
    const text = typeof e.lookXml === "string" ? e.lookXml.trim() : "";
    return text ? { apply: e.applyLook === true, text } : null;
  };
  if (typeof o.lookXml === "string" || typeof o.applyLook === "boolean") {
    const e = entry(o);
    return e ? [{ campaignId: null, ...e }] : [];
  }
  return Object.entries(o).flatMap(([id, v]) => {
    const e = entry(v);
    return e ? [{ campaignId: id, ...e }] : [];
  });
}

/**
 * One time: the old pasted looks become saved looks. Identical texts are stored once, as "My look";
 * different ones follow as "My look 2" and so on. Every campaign that had "Apply my look" on points at
 * its look (the flat shape points every campaign without one). A switched-off look is still kept in the
 * list. A text that no longer parses is skipped (it stays in the old settings, untouched) and never stops
 * the move; when it was switched on, its campaign is named in `unread` so the look row can say so once.
 */
export function migratePastedLook(
  campaigns: readonly Campaign[],
  looks: readonly SavedLook[],
  legacy: unknown,
  now: number = Date.now(),
  makeId: () => string = newLookId,
): { campaigns: Campaign[]; looks: SavedLook[]; migrated: boolean; unread: string[] } {
  const entries = legacyLookEntries(legacy);
  if (entries.length === 0) return { campaigns: [...campaigns], looks: [...looks], migrated: true, unread: [] };
  const parsed: { campaignId: string | null; apply: boolean; text: string; look: Look }[] = [];
  const unread: string[] = [];
  for (const e of entries) {
    try {
      parsed.push({ ...e, look: parseLook(e.text) });
    } catch {
      if (e.apply) unread.push(e.campaignId ?? "*");
    }
  }
  let list = [...looks];
  const idByText = new Map<string, string>();
  for (const e of parsed) {
    if (idByText.has(e.text)) continue;
    const { looks: next, saved } = addSavedLook(list, { fileName: MIGRATED_NAME, look: e.look }, now, makeId);
    list = next;
    idByText.set(e.text, saved.id);
  }
  const next = campaigns.map((c) => {
    if (c.fcpLookId) return c;
    const mine = parsed.find((e) => e.apply && e.campaignId === c.id) ?? parsed.find((e) => e.apply && e.campaignId === null);
    return mine ? { ...c, fcpLookId: idByText.get(mine.text) } : c;
  });
  return { campaigns: next, looks: list, migrated: true, unread };
}

// ---- persistence ------------------------------------------------------------------------

export function loadSavedLooks(): SavedLook[] {
  return normalizeSavedLooks(readSetting<unknown>(KEY_LOOKS, []));
}

/** The last look picked or uploaded, if it still exists. */
export function loadLastLookId(looks: readonly SavedLook[] = loadSavedLooks()): string | undefined {
  const id = readSetting<unknown>(KEY_LAST_LOOK, "");
  return typeof id === "string" && looks.some((l) => l.id === id) ? id : undefined;
}

export function rememberLastLook(id: string): void {
  writeSetting(KEY_LAST_LOOK, id);
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
