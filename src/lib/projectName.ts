/**
 * File: projectName.ts
 * Path: src/lib/projectName.ts
 * Description: Suggests a short project name (two words at most) for a banked clip, taken from
 *   the label that came in with the imported timestamps, then from its category. Pure: no
 *   storage, no React. Returns "" when there is nothing usable, so callers fall back to the
 *   campaign's project name pattern.
 */

const SKIP = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "from", "by",
  "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "these", "those",
  "as", "if", "so", "do", "does", "did", "my", "your", "his", "her", "our", "their",
]);

const WORD = /[\p{L}\p{N}]+(?:['\u2019]\p{L}+)?/gu;

function title(word: string): string {
  const shout = word === word.toUpperCase() && word.length > 4;
  const rest = shout ? word.slice(1).toLowerCase() : word.slice(1);
  return word.charAt(0).toUpperCase() + rest;
}

function words(text: string | undefined): string[] {
  return (text ?? "")
    .match(WORD)
    ?.filter((w) => w.length > 1 && !/^\d+$/.test(w) && !SKIP.has(w.toLowerCase())) ?? [];
}

/** Up to two words, in Title Case: from the label first, then topped up from the category. */
export function suggestProjectName(clip: { label?: string; category?: string }): string {
  const picked: string[] = [];
  for (const w of [...words(clip.label), ...words(clip.category)]) {
    if (picked.length === 2) break;
    if (!picked.some((p) => p.toLowerCase() === w.toLowerCase())) picked.push(title(w));
  }
  return picked.join(" ");
}
