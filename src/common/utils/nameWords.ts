/**
 * File: nameWords.ts
 * Path: src/common/utils/nameWords.ts
 * Description: The one rule for turning text (a label, a category, a video title) into the words of a
 *   clip name: letters and digits only, no stop words, no bare numbers, Title Case. The renderer names
 *   banked clips with it and the engine falls back to it, so the lane's suggestion and the saved
 *   file's name can never differ. In common because both processes use it. Pure.
 */

const SKIP = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "for", "with", "from", "by",
  "is", "are", "was", "were", "be", "been", "it", "its", "this", "that", "these", "those",
  "as", "if", "so", "do", "does", "did", "my", "your", "his", "her", "our", "their",
]);

const WORD = /[\p{L}\p{N}]+(?:['’]\p{L}+)?/gu;

export function titleCaseWord(word: string): string {
  const shout = word === word.toUpperCase() && word.length > 4;
  const rest = shout ? word.slice(1).toLowerCase() : word.slice(1);
  return word.charAt(0).toUpperCase() + rest;
}

/** The usable words of a text, as written. */
export function nameWords(text: string | undefined): string[] {
  return (text ?? "").match(WORD)?.filter((w) => w.length > 1 && !/^\d+$/.test(w) && !SKIP.has(w.toLowerCase())) ?? [];
}

/** Up to two different words from the texts in order, in Title Case ("" when none). */
export function twoWordName(...texts: (string | undefined)[]): string {
  const picked: string[] = [];
  for (const w of texts.flatMap(nameWords)) {
    if (picked.length === 2) break;
    if (!picked.some((p) => p.toLowerCase() === w.toLowerCase())) picked.push(titleCaseWord(w));
  }
  return picked.join(" ");
}
