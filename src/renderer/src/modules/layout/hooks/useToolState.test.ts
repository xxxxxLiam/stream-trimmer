/**
 * File: useToolState.test.ts
 * Description: The shared timeline tools: zoom stays inside 0 to 100, Fit resets zoom and is counted.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { TOOL_KEYS, TIMELINE_TOOLS, toolForKey, clampZoom, requestFit, resetToolStateForTest, setTool, setZoom, getToolStateForTest } from "./useToolState";

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
  assert.equal(clampZoom(12.644), 12.64, "hundredths, so Fit can frame a range as the board does");
});

test("a fresh timeline starts on the pointer, which only moves the playhead", () => {
  resetToolStateForTest();
  assert.equal(getToolStateForTest().tool, "pointer");
});

test("tool keys: A pointer, B scissors, D select range, F flag, H hand, Z zoom; M and modified keys are not tools", () => {
  const k = (key: string, mods: Partial<{ metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }> = {}) =>
    toolForKey({ key, metaKey: false, ctrlKey: false, altKey: false, ...mods });
  assert.deepEqual(["a", "b", "d", "f", "h", "z"].map((x) => k(x)), ["pointer", "clip", "range", "flag", "hand", "zoom"]);
  assert.equal(k("A"), "pointer");
  assert.equal(k("m"), null, "M drops a flag at the playhead, it does not pick the Flag tool");
  assert.equal(k("r"), null, "R is Retry");
  assert.equal(k("d", { metaKey: true }), null);
  assert.equal(k("s"), null, "S is the review flow's skip key, not a tool");
  assert.equal(k("z", { ctrlKey: true }), null);
  assert.equal(new Set(TIMELINE_TOOLS.map((t) => TOOL_KEYS[t])).size, TIMELINE_TOOLS.length, "no two tools share a key");
});
