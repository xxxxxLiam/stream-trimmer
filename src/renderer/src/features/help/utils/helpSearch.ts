/**
 * File: helpSearch.ts
 * Path: src/renderer/src/features/help/utils/helpSearch.ts
 * Description: The instant Help filter. No server, index or AI: typed words are matched against each
 *   question, its answer, the More rows and the shortcut names, ignoring case and word order, with a
 *   small list of editor words. Matches keep the list order.
 */
import { HELP_ANSWERS, HELP_MORE, SHORTCUTS, answerText, type HelpAnswer, type HelpMoreId } from "./helpContent";

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "")
    .split(/[^a-z0-9+]+/)
    .filter(Boolean);
}

/** Every typed word must appear (as a prefix of a word, or inside a synonym phrase). */
function matches(query: string, haystack: string): boolean {
  const have = words(haystack);
  const raw = haystack.toLowerCase().replace(/[’']/g, "");
  const want = words(query);
  if (want.length === 0) return true;
  // A typed word matches the start of a word, or the start of a phrase or file name (cookies.txt), never the middle of one ("lut" is not "resolution").
  return want.every((w) => have.some((h) => h.startsWith(w)) || new RegExp(`(^|[^a-z0-9])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(raw));
}

export type HelpResults = { answers: HelpAnswer[]; more: HelpMoreId[] };

export function searchHelp(query: string): HelpResults {
  const q = query.trim();
  if (!q) return { answers: HELP_ANSWERS.filter((a) => !a.searchOnly), more: HELP_MORE.map((m) => m.id) };
  const answers = HELP_ANSWERS.filter((a) => matches(q, [answerText(a), ...a.synonyms].join(" ")));
  // Key names count too: Ctrl or Cmd for ⌘, and the key itself ("enter", "space").
  const shortcutText = SHORTCUTS.map((s) => `${s.does} ${s.keys.replace("⌘", "ctrl cmd command")}`).join(" ");
  const more = HELP_MORE.filter((m) =>
    matches(q, [m.label, ...m.synonyms, m.id === "shortcuts" ? shortcutText : ""].join(" ")),
  ).map((m) => m.id);
  return { answers, more };
}
