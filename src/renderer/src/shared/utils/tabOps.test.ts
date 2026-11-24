/**
 * File: tabOps.test.ts
 * Description: The browser-tab rules — which tab opens after a close, the Cmd/Ctrl+digit map,
 *   drag-drop and keyboard reordering, and the position a suspended tab resumes at.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  activeAfterClose,
  dropIndex,
  indexForDigit,
  moveItem,
  resumeStart,
  stepIndex,
} from "./tabOps";

test("closing a tab activates the one to its right, else the one to its left", () => {
  const ids = ["a", "b", "c", "d"];
  assert.equal(activeAfterClose(ids, "a"), "b");
  assert.equal(activeAfterClose(ids, "b"), "c");
  assert.equal(activeAfterClose(ids, "d"), "c");
  assert.equal(activeAfterClose(["a"], "a"), null, "the caller makes a fresh tab");
  assert.equal(activeAfterClose(ids, "zzz"), null);
});

test("Cmd/Ctrl+1..8 jump to that tab, 9 jumps to the LAST tab", () => {
  assert.equal(indexForDigit(1, 5), 0);
  assert.equal(indexForDigit(3, 5), 2);
  assert.equal(indexForDigit(6, 5), null, "no sixth tab: do nothing");
  assert.equal(indexForDigit(9, 5), 4);
  assert.equal(indexForDigit(9, 12), 11, "9 is the last tab, not the ninth");
  assert.equal(indexForDigit(9, 1), 0);
  assert.equal(indexForDigit(0, 5), null);
});

test("arrow movement wraps both ways", () => {
  assert.equal(stepIndex(0, -1, 3), 2);
  assert.equal(stepIndex(2, 1, 3), 0);
  assert.equal(stepIndex(1, 1, 3), 2);
});

test("moveItem reorders, clamps, and returns the same array for a no-op", () => {
  const t = [{ id: "a" }, { id: "b" }, { id: "c" }];
  assert.deepEqual(moveItem(t, "a", 2).map((x) => x.id), ["b", "c", "a"]);
  assert.deepEqual(moveItem(t, "c", 0).map((x) => x.id), ["c", "a", "b"]);
  assert.deepEqual(moveItem(t, "a", 99).map((x) => x.id), ["b", "c", "a"]);
  assert.equal(moveItem(t, "b", 1), t);
  assert.equal(moveItem(t, "nope", 0), t);
});

test("dropping on the near half of a tab lands where the line was drawn", () => {
  // a b c d, drag a (0) onto the right half of c (2): a belongs between c and d.
  assert.equal(dropIndex(0, 2, "after"), 2);
  // drag a onto the left half of c: between b and c.
  assert.equal(dropIndex(0, 2, "before"), 1);
  // drag d (3) onto the left half of b (1): before b.
  assert.equal(dropIndex(3, 1, "before"), 1);
  assert.equal(dropIndex(3, 1, "after"), 2);
  // dropping next to itself is a no-op
  assert.equal(dropIndex(2, 2, "before"), 2);
  assert.equal(dropIndex(2, 2, "after"), 2);
});

test("a suspended tab resumes at the saved second, only for the same video", () => {
  assert.equal(resumeStart({ videoId: "v", time: 125.9 }, "v"), 125);
  assert.equal(resumeStart({ videoId: "v", time: 125.9 }, "other"), 0);
  assert.equal(resumeStart(null, "v"), 0);
  assert.equal(resumeStart({ videoId: "v", time: NaN }, "v"), 0);
});
