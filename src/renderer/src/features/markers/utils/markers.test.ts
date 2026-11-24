import assert from "node:assert/strict";
import test from "node:test";
import { groupFlags, keyOf, nextOpenFlag, trimWindow, wordsAt, type FlagMemory } from "./markers";

const lines = [
  { start: 0, end: 10, text: "welcome back" },
  { start: 10, end: 20, text: "nobody talks about pricing" },
];
const empty: FlagMemory = { ranges: {}, clipped: [] };

test("wordsAt gives the line at the flag, or nothing without a transcript", () => {
  assert.equal(wordsAt(lines, 12), "nobody talks about pricing");
  assert.equal(wordsAt([], 12), "");
});

test("flags with ranges group only when there are two", () => {
  const one: FlagMemory = { ranges: { [keyOf(5)]: { start: 0, end: 30 } }, clipped: [] };
  assert.equal(groupFlags([5, 12], one, lines).ranged.length, 0);
  assert.equal(groupFlags([5, 12], one, lines).open.length, 2);
  const two: FlagMemory = { ranges: { [keyOf(5)]: { start: 0, end: 30 }, [keyOf(12)]: { start: 0, end: 30 } }, clipped: [] };
  const g = groupFlags([12, 5, 40], two, lines);
  assert.deepEqual(g.ranged.map((r) => r.at), [5, 12]);
  assert.deepEqual(g.open.map((r) => r.at), [40]);
});

test("clipped flags fold into their own list and leave the others", () => {
  const mem: FlagMemory = { ranges: {}, clipped: [5] };
  const g = groupFlags([5, 12], mem, lines);
  assert.deepEqual(g.clipped.map((r) => r.at), [5]);
  assert.deepEqual(g.open.map((r) => r.at), [12]);
});

test("nextOpenFlag skips trimmed flags and wraps round", () => {
  const mem: FlagMemory = { ranges: { [keyOf(20)]: { start: 5, end: 35 } }, clipped: [] };
  const g = groupFlags([10, 20, 30], mem, []);
  assert.equal(nextOpenFlag(g, 12)?.at, 30);
  assert.equal(nextOpenFlag(g, 40)?.at, 10);
  assert.equal(nextOpenFlag(groupFlags([], empty, []), 0), null);
});

test("trimWindow is 30 seconds around the flag and stays inside the video", () => {
  assert.deepEqual(trimWindow(100, 600), { start: 85, end: 115 });
  assert.deepEqual(trimWindow(4, 600), { start: 0, end: 19 });
  assert.deepEqual(trimWindow(595, 600), { start: 570, end: 600 });
});

test("marking a flag clipped is recorded once, and a trim stores its range", async () => {
  const { markClipped, setRange } = await import("./markerMemory");
  const once = markClipped({ ranges: {}, clipped: [] }, 5);
  assert.deepEqual(markClipped(once, 5).clipped, [5]);
  assert.deepEqual(setRange(once, 5, { start: 1, end: 2 }).ranges[keyOf(5)], { start: 1, end: 2 });
});
