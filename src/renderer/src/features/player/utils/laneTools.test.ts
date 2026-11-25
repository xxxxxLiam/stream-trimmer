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
  assert.equal(pickHintLead("pointer"), "Choose Select range, then drag on the timeline");
});

test("B2-8: flag, hand and zoom each get their own hint, none says Drag", () => {
  const leads = ["flag", "hand", "zoom"].map(pickHintLead);
  assert.equal(new Set(leads).size, 3);
  for (const l of leads) assert.doesNotMatch(l, /^(Drag|Choose)/);
});

import { TOOL_CURSORS, clampX, placeLabels, sourceLaneHeight, wheelAction } from "./laneTools";

test("wheel: sideways pans, Shift+wheel pans, Ctrl/Cmd+wheel zooms, plain vertical is left alone", () => {
  const e = { deltaX: 0, deltaY: 0, shiftKey: false, ctrlKey: false, metaKey: false };
  assert.deepEqual(wheelAction({ ...e, deltaX: 40, deltaY: 3 }), { kind: "pan", pixels: 40 });
  assert.deepEqual(wheelAction({ ...e, deltaY: 30, shiftKey: true }), { kind: "pan", pixels: 30 });
  assert.equal(wheelAction({ ...e, deltaY: 30 }), null);
  assert.deepEqual(wheelAction({ ...e, deltaY: -100, ctrlKey: true }), { kind: "zoom", amount: 20 }, "a wheel notch is one step");
  assert.deepEqual(wheelAction({ ...e, deltaY: 100, metaKey: true }), { kind: "zoom", amount: -20 });
  assert.deepEqual(wheelAction({ ...e, deltaY: -2, ctrlKey: true }), { kind: "zoom", amount: 3 }, "a pinch is smooth, not a step per event");
});

test("a scrub that leaves the lane stays on its ends", () => {
  assert.equal(clampX(-20, 500), 0);
  assert.equal(clampX(900, 500), 500);
  assert.equal(clampX(120, 500), 120);
});

test("each tool has its own cursor", () => {
  assert.equal(new Set(Object.values(TOOL_CURSORS)).size, 6);
});

test("a name that does not fit its bar continues into free space, and is cut only when space runs out", () => {
  const bars = [
    { left: 0, width: 20, label: "Brotherhood" }, // too narrow, 200px free after it
    { left: 220, width: 20, label: "Marriage" }, // too narrow, 30px free after it
    { left: 270, width: 300, label: "Short" }, // fits inside
    { left: 575, width: 10, label: "Lifestyle" }, // too narrow, nothing free after it
  ];
  const p = placeLabels(bars, 590);
  assert.deepEqual(p[0], { inside: false, outsideWidth: 93 }, "whole name, no ellipsis");
  assert.equal(p[1].inside, false);
  assert.ok(p[1].outsideWidth < 72, "cut to the 26px left");
  assert.equal(p[2].inside, true);
  assert.equal(p[3].inside, true, "no room: stays inside and truncates");
});

test("the Source lane keeps 44px at the default timeline and takes all the extra height", () => {
  assert.equal(sourceLaneHeight(200), 44);
  assert.equal(sourceLaneHeight(150), 44);
  assert.equal(sourceLaneHeight(380), 224);
});
