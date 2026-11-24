/**
 * File: snap.test.ts
 * Path: src/renderer/src/features/player/utils/snap.test.ts
 * Description: Word snapping for a dragged In and Out, and no snapping without word times.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { hasWordTimes, snapToWord } from "./snap";

const lines = [
  {
    start: 10,
    end: 14,
    text: "the honest version",
    words: [
      { start: 10, end: 10.8, text: "the" },
      { start: 10.8, end: 12, text: "honest" },
      { start: 12, end: 14, text: "version" },
    ],
  },
];

test("In snaps to the start of the word under it, Out to its end", () => {
  assert.equal(snapToWord(lines, 11.3, "start"), 10.8);
  assert.equal(snapToWord(lines, 11.3, "end"), 12);
  assert.equal(snapToWord(lines, 13.9, "end"), 14);
});

test("between words it picks the nearest word", () => {
  assert.equal(snapToWord(lines, 16, "start"), 12);
});

test("without word times nothing snaps", () => {
  const plain = [{ start: 10, end: 14, text: "the honest version" }];
  assert.equal(hasWordTimes(plain), false);
  assert.equal(snapToWord(plain, 11.3, "start"), 11.3);
  assert.equal(snapToWord(null, 11.3, "end"), 11.3);
  assert.equal(hasWordTimes(lines), true);
});
