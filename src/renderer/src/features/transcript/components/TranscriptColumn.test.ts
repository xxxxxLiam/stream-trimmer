/**
 * File: TranscriptColumn.test.ts
 * Path: src/renderer/src/features/transcript/components/TranscriptColumn.test.ts
 * Description: B-1 — a stale active-match index must not crash the transcript column.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { searchTranscript } from "../utils/transcript";
import { pickActiveMatch } from "./TranscriptColumn";

const lines = [
  { start: 0, end: 2, text: "the needle is here" },
  { start: 2, end: 4, text: "nothing" },
];

test("B-1: an active index left over from a larger result set yields no match, not undefined", () => {
  const before = searchTranscript(lines, "needle");
  assert.equal(before.length, 1);
  assert.equal(pickActiveMatch(before, 0), before[0]);

  // Same render in which the user typed one more character: matches already empty,
  // active still 0 because the effect that resets it has not run.
  const after = searchTranscript(lines, "needles");
  assert.equal(after.length, 0);
  assert.doesNotThrow(() => {
    const m = pickActiveMatch(after, 0);
    assert.equal(m, null);
    return m !== null && (m as { line: number }).line;
  });
});

test("B-1: cleared box (empty matches) with a stale index, and a stale index past a shorter list", () => {
  assert.equal(pickActiveMatch([], 3), null);
  assert.equal(pickActiveMatch([{ line: 1 }], 1), null);
  assert.equal(pickActiveMatch([{ line: 1 }], -1), null);
});

import { readFileSync } from "node:fs";

test("B-1 wiring: the column derives its active match through pickActiveMatch", () => {
  const src = readFileSync(new URL("./TranscriptColumn.tsx", import.meta.url), "utf8");
  assert.match(src, /pickActiveMatch\(w\.matches, w\.active\)/);
  assert.doesNotMatch(src, /w\.matches\[w\.active\]/);
});
