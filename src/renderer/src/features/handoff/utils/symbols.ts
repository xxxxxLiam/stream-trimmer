/**
 * File: symbols.ts
 * Path: src/renderer/src/features/handoff/utils/symbols.ts
 * Description: Data for the symbols palette (BUILD-SPEC section 8). Add an
 *   entry to a group below and it appears in the palette; the component never
 *   needs touching. No em dash anywhere, on purpose (user style rule).
 *   Glyphs are written as code points so they cannot be mangled by an editor.
 */

export type SymbolGroupId = "symbols" | "honorifics" | "phrases" | "marks";

export interface SymbolEntry {
  /** Stable key, also used for the Recent row. */
  id: string;
  /** Exactly what is written to the clipboard. */
  text: string;
  /** Searchable name, also the chip's tooltip. */
  name: string;
  /** Extra searchable words. */
  aliases: string[];
  /** True when the text is Arabic script and needs the Arabic font stack. */
  arabic?: boolean;
}

export interface SymbolGroup {
  id: SymbolGroupId;
  label: string;
  entries: SymbolEntry[];
}

const glyph = (
  cp: number,
  name: string,
  aliases: string[],
  arabic = true,
): SymbolEntry => ({
  id: `u${cp.toString(16).toUpperCase().padStart(4, "0")}`,
  text: String.fromCodePoint(cp),
  name,
  aliases: [`U+${cp.toString(16).toUpperCase().padStart(4, "0")}`, ...aliases],
  arabic,
});

const txt = (text: string, name: string, aliases: string[] = []): SymbolEntry => ({
  id: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || text,
  text,
  name,
  aliases,
});

export const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    id: "symbols",
    label: "Symbols",
    entries: [
      glyph(0xfdfd, "Bismillah", ["bismillah ligature", "in the name of allah", "basmala"]),
      glyph(0xfdfa, "Sallallahu alayhi wa sallam", ["salla", "saw", "pbuh", "peace be upon him"]),
      glyph(0xfdfb, "Jalla jalaluhu", ["allah", "jalla", "ligature"]),
      glyph(0x0610, "Sallallahu alayhi wa sallam sign", ["sallallahu sign", "honorific sign", "salla mark"]),
      glyph(0x0611, "Alayhi as-salam sign", ["alayhi", "alaihi", "as salam sign"]),
      glyph(0x0612, "Rahimahullah sign", ["rahmatullah", "rahimahu", "rh sign"]),
      glyph(0x0613, "Radiyallahu anhu sign", ["radi", "radiallahu", "ra sign"]),
      glyph(0xfd3e, "Ornate left parenthesis", ["ayah bracket", "quran bracket", "open bracket"]),
      glyph(0xfd3f, "Ornate right parenthesis", ["ayah bracket", "quran bracket", "close bracket"]),
      glyph(0x06de, "Start of rub el hizb", ["rub el hizb", "hizb", "verse marker", "ayah marker"]),
    ],
  },
  {
    id: "honorifics",
    label: "Honorifics",
    entries: [
      txt("sallallahu alayhi wa sallam", "Sallallahu alayhi wa sallam", ["saw", "pbuh", "peace be upon him", "salla"]),
      txt("subhanahu wa ta'ala", "Subhanahu wa ta'ala", ["swt", "glorified and exalted"]),
      txt("azza wa jalla", "Azza wa jalla", ["awj", "mighty and majestic"]),
      txt("jalla jalaluhu", "Jalla jalaluhu", ["jj", "majestic is his majesty"]),
      txt("tabarakahu wa ta'ala", "Tabarakahu wa ta'ala", ["blessed and exalted"]),
      txt("radiyallahu anhu", "Radiyallahu anhu", ["ra", "him", "may allah be pleased with him"]),
      txt("radiyallahu anha", "Radiyallahu anha", ["ra", "her", "may allah be pleased with her"]),
      txt("radiyallahu anhuma", "Radiyallahu anhuma", ["ra", "both", "two", "may allah be pleased with them both"]),
      txt("radiyallahu anhum", "Radiyallahu anhum", ["ra", "them", "plural", "may allah be pleased with them"]),
      txt("alayhi as-salam", "Alayhi as-salam", ["as", "alayhis salam", "peace be upon him", "prophet"]),
      txt("alayhim as-salam", "Alayhim as-salam", ["as", "alayhimus salam", "peace be upon them", "prophets"]),
      txt("rahimahullah", "Rahimahullah", ["rh", "may allah have mercy on him"]),
      txt("rahimahumullah", "Rahimahumullah", ["rh", "may allah have mercy on them"]),
      txt("hafizahullah", "Hafizahullah", ["may allah preserve him"]),
    ],
  },
  {
    id: "phrases",
    label: "Phrases",
    entries: [
      txt("Bismillahir Rahmanir Raheem", "Bismillahir Rahmanir Raheem", ["bismillah", "basmala", "in the name of allah"]),
      txt("Alhamdulillah", "Alhamdulillah", ["praise be to allah", "all praise"]),
      txt("SubhanAllah", "SubhanAllah", ["subhan allah", "glory be to allah"]),
      txt("Allahu Akbar", "Allahu Akbar", ["takbir", "allah is greatest"]),
      txt("Masha'Allah", "Masha'Allah", ["mashallah", "ma sha allah", "as allah willed"]),
      txt("Insha'Allah", "Insha'Allah", ["inshallah", "in sha allah", "if allah wills"]),
      txt("Astaghfirullah", "Astaghfirullah", ["i seek forgiveness", "istighfar"]),
      txt("La ilaha illa Allah", "La ilaha illa Allah", ["shahada", "tawhid", "no god but allah"]),
      txt("La hawla wa la quwwata illa billah", "La hawla wa la quwwata illa billah", ["hawqala", "no power no strength"]),
      txt("Inna lillahi wa inna ilayhi raji'un", "Inna lillahi wa inna ilayhi raji'un", ["istirja", "condolence", "to allah we belong"]),
      txt("Assalamu alaykum wa rahmatullahi wa barakatuh", "Assalamu alaykum wa rahmatullahi wa barakatuh", ["salam", "greeting", "peace be upon you"]),
      txt("Wa alaykum as-salam", "Wa alaykum as-salam", ["reply", "greeting", "and upon you peace"]),
      txt("Jazakallahu khayran", "Jazakallahu khayran", ["jazakallah", "thank you", "may allah reward you"]),
      txt("Barakallahu feek", "Barakallahu feek", ["barakallah", "may allah bless you"]),
      txt("Fi amanillah", "Fi amanillah", ["goodbye", "farewell", "in allah's protection"]),
      txt("Ameen", "Ameen", ["amin", "amen"]),
    ],
  },
  {
    id: "marks",
    label: "Marks",
    entries: [
      txt("ʿ", "Ayn", ["ayn", "ain", "left half ring", "modifier letter"]),
      txt("ʾ", "Hamza", ["hamza", "right half ring", "modifier letter"]),
      txt("ā", "A macron", ["a with macron", "long a", "aa"]),
      txt("ī", "I macron", ["i with macron", "long i", "ee"]),
      txt("ū", "U macron", ["u with macron", "long u", "oo"]),
      txt("ṣ", "S dot below", ["s with dot below", "sad", "emphatic s"]),
      txt("ḍ", "D dot below", ["d with dot below", "dad", "emphatic d"]),
      txt("ṭ", "T dot below", ["t with dot below", "ta", "emphatic t"]),
      txt("ẓ", "Z dot below", ["z with dot below", "za", "dha", "emphatic z"]),
      txt("ḥ", "H dot below", ["h with dot below", "ha", "emphatic h"]),
      txt("…", "Ellipsis", ["dots", "three dots", "trailing off"]),
      txt("–", "En dash", ["dash", "range", "en"]),
      txt("'", "Apostrophe", ["straight apostrophe", "single quote", "straight"]),
      txt("\"", "Double quote", ["straight quote", "quotation mark", "straight"]),
      txt("“", "Open double quote", ["curly quote", "left quote", "smart quote"]),
      txt("”", "Close double quote", ["curly quote", "right quote", "smart quote"]),
      txt("→", "Arrow", ["right arrow", "to", "becomes"]),
      txt("·", "Middle dot", ["interpunct", "separator", "bullet"]),
    ],
  },
];

/** Every entry, flattened, with its group id. */
export function allEntries(): Array<SymbolEntry & { group: SymbolGroupId }> {
  return SYMBOL_GROUPS.flatMap((g) => g.entries.map((e) => ({ ...e, group: g.id })));
}

/** Match on glyph, name or alias, case-insensitive; every word must match. */
export function matchesQuery(entry: SymbolEntry, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = [entry.text, entry.name, ...entry.aliases].join("\n").toLowerCase();
  return q.split(/\s+/).every((w) => hay.includes(w));
}
