/**
 * File: channelData.test.ts
 * Description: The Top N steps stop at both ends, a count between steps snaps in the pressed direction,
 *   the estimate never reads under a minute, and the Last export line uses grouped numbers.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { estimateLine, lastExportDetail, stepLimit } from "./channelData";

test("the steps walk 10 to 1000 and stop at the ends", () => {
  assert.equal(stepLimit(100, 1), 200);
  assert.equal(stepLimit(100, -1), 50);
  assert.equal(stepLimit(1000, 1), 1000);
  assert.equal(stepLimit(10, -1), 10);
});

test("a typed count between steps snaps in the pressed direction", () => {
  assert.equal(stepLimit(120, 1), 200);
  assert.equal(stepLimit(120, -1), 100);
});

test("the estimate is at least a minute and grows with the count", () => {
  assert.equal(estimateLine(1), "About 1 min");
  assert.equal(estimateLine(100), "About 25 min");
});

test("last export reads with grouped numbers", () => {
  assert.equal(lastExportDetail({ videos: 100, transcripts: 74210 }), "100 videos · 74,210 transcript lines");
});
