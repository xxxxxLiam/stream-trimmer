/**
 * File: useToolState.test.ts
 * Description: The shared timeline tools: zoom stays inside 0 to 100, Fit resets zoom and is counted.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { clampZoom, requestFit, resetToolStateForTest, setTool, setZoom, getToolStateForTest } from "./useToolState";

test("zoom is clamped, Fit resets it and counts, the tool changes", () => {
  resetToolStateForTest();
  setZoom(250);
  assert.equal(getToolStateForTest().zoom, 100);
  setZoom(-5);
  assert.equal(getToolStateForTest().zoom, 0);
  setZoom(40);
  requestFit();
  assert.deepEqual([getToolStateForTest().zoom, getToolStateForTest().fitRequests], [0, 1]);
  setTool("flag");
  assert.equal(getToolStateForTest().tool, "flag");
  assert.equal(clampZoom(12.64), 12.6, "tenths, so Fit can frame a range as the board does");
});
