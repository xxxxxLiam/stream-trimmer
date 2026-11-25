/**
 * File: laneTools.test.ts
 * Path: src/renderer/src/features/player/utils/laneTools.test.ts
 * Description: Scissors clicks, edge grabbing and the zoom step.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { grabbedEdge, pickHintLead, scissorsClick, zoomStep } from "./laneTools";

test("scissors: the first click is a start, the second ends the range", () => {
  assert.deepEqual(scissorsClick(null, 100), { kind: "start", at: 100 });
  assert.deepEqual(scissorsClick(100, 142), { kind: "range", start: 100, end: 142 });
});

test("scissors: an end clicked before the start still makes an ordered range", () => {
  assert.deepEqual(scissorsClick(100, 80), { kind: "range", start: 80, end: 100 });
});

test("an edge is grabbed within a few pixels, the nearer one wins", () => {
  assert.equal(grabbedEdge(103, 100, 400), "start");
  assert.equal(grabbedEdge(398, 100, 400), "end");
  assert.equal(grabbedEdge(250, 100, 400), null);
  assert.equal(grabbedEdge(102, 100, 104), "start");
});

test("alt zooms out", () => {
  assert.equal(zoomStep(false), 20);
  assert.equal(zoomStep(true), -20);
});

test("the first-clip hint matches the tool in hand", () => {
  assert.equal(pickHintLead("clip"), "Click to set the start, click again for the end");
  assert.equal(pickHintLead("pointer"), "Drag on the timeline");
});

test("B2-8: flag, hand and zoom each get their own hint, none says Drag", () => {
  const leads = ["flag", "hand", "zoom"].map(pickHintLead);
  assert.equal(new Set(leads).size, 3);
  for (const l of leads) assert.doesNotMatch(l, /^Drag/);
});
