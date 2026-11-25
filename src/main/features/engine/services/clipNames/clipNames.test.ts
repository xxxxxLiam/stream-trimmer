/**
 * File: clipNames.test.ts
 * Path: src/main/features/engine/services/clipNames/clipNames.test.ts
 * Description: Pins the offline clip-name suggestions: no filler or contractions, a phrase that runs
 *   through the whole video loses to one special to the range, fallback to the video title, two words
 *   at most, safe file names, and a fixed fixture range that fails if the scoring is removed.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { buildNameTable, rankedNames, safeFileName, suggestClipName, type NameLine } from "./clipNames";

// 20 windows of 30 s. "Sam Carter" (the guest) is said everywhere; "red shirt" only in 300-330 s.
const lines: NameLine[] = [];
for (let w = 0; w < 20; w++) {
  const t = w * 30;
  lines.push({ start: t, end: t + 10, text: "So um Sam Carter, I'm gonna say that the show is great" });
  lines.push({ start: t + 10, end: t + 20, text: "Sam Carter and like the weather today is fine" });
}
const special: NameLine[] = [
  { start: 300, end: 310, text: "He wore a red shirt, a red shirt to the court, I'm sure" },
  { start: 310, end: 320, text: "Sam Carter said the red shirt matters, doing doing" },
  { start: 320, end: 328, text: "Sam Carter agreed. Sam Carter laughed. Sam Carter left." },
];
const all = [...lines.filter((l) => l.start < 300 || l.start >= 330), ...special].sort((a, b) => a.start - b.start);
const table = buildNameTable(all);
const range = [{ start: 300, end: 330 }];

test("a phrase special to the range beats one said through the whole video", () => {
  assert.equal(rankedNames(table, all, range)[0], "Red Shirt");
});

test("without the video-wide weighting the guest's name wins, so the weighting is what is tested", () => {
  const flat = { windows: table.windows, df: new Map<string, number>() };
  assert.equal(rankedNames(flat, all, range)[0], "Sam Carter");
  assert.equal(rankedNames(table, all, range)[0], "Red Shirt");
});

test("no filler, stopword, contraction or repeated-word pair in any candidate", () => {
  for (const name of rankedNames(table, all, range)) {
    assert.ok(!/['’]/.test(name), name);
    assert.ok(!/\b(Doing|Gonna|Like|Um|Sure)\b/.test(name), name);
    const w = name.toLowerCase().split(" ");
    if (w.length === 2) assert.notEqual(w[0], w[1]);
  }
});

test("a name is at most two words", () => {
  for (const name of rankedNames(table, all, range)) assert.ok(name.split(" ").length <= 2, name);
});

test("no transcript falls back to two words of the title, the same as the saved file, then 2 (C2-7)", () => {
  const title = "Podcast #214, the long talk";
  const first = suggestClipName({ table: null, lines: [], ranges: range, videoTitle: title });
  assert.equal(first, "Podcast Long", "stop words and bare numbers dropped, Title Case, two words");
  assert.equal(suggestClipName({ table: null, lines: [], ranges: range, videoTitle: title, existing: [first] }), "Podcast Long 2");
  assert.equal(suggestClipName({ table: null, lines: [], ranges: range, videoTitle: "214" }), "Clip");
});

test("repeat names get a quiet number and refresh walks down the list", () => {
  const a = suggestClipName({ table, lines: all, ranges: range, videoTitle: "T" });
  assert.equal(suggestClipName({ table, lines: all, ranges: range, videoTitle: "T", existing: [a] }), `${a} 2`);
  assert.notEqual(suggestClipName({ table, lines: all, ranges: range, videoTitle: "T", skip: 1 }), a);
});

test("names are safe on Mac and Windows", () => {
  assert.equal(safeFileName('Why? "Now": a/b\\c.'), "Why Now a b c");
  assert.equal(safeFileName("CON"), "CON clip");
  assert.ok(safeFileName("x".repeat(200)).length <= 80);
});

// The renderer asserts this same table for the saved name (projectName.test.ts): the lane's fallback is the file's name.
const TITLE_NAMES: [string, string][] = [
  ["Podcast #214, the long talk", "Podcast Long"],
  ["How I Made $10k in 30 days", "How Made"],
  ["THE GREATEST SPEECH EVER GIVEN", "Greatest Speech"],
  ["日本語 の タイトル", "日本語 タイトル"],
  ["214", "Clip"],
];

test("the lane fallback for each kind of title is the name the file gets (C2-7)", () => {
  for (const [title, name] of TITLE_NAMES) {
    assert.equal(suggestClipName({ table: null, lines: [], ranges: range, videoTitle: title }), name, title);
  }
});
