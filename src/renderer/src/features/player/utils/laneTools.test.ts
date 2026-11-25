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

import { DEFAULT_SIZES } from "../../../modules/layout/utils/panelLayout";
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
  assert.equal(sourceLaneHeight(DEFAULT_SIZES.timeline), 44);
  assert.equal(sourceLaneHeight(150), 44);
  assert.equal(sourceLaneHeight(DEFAULT_SIZES.timeline + 180), 224);
});

test("the default timeline is tall enough for the board's five lanes under the tools row and ruler", () => {
  // Transcript 32 + Source 44 + two Audio 32 + Clips 34, the ruler 18, the tools row 44 (+ its 10px below).
  assert.ok(DEFAULT_SIZES.timeline >= 32 + 44 + 32 + 32 + 34 + 18 + 44 + 10);
});

import { cursorFor, zoomFromX } from "./laneTools";

test("V18-T-6: names laid out beside overlapping bars never run over the next bar or each other", () => {
  // Seven clips within two minutes of a 2 h video at zoom 0: 18 px bars, 3 px apart.
  const bars = Array.from({ length: 7 }, (_, i) => ({ left: 400 + i * 3, width: 18, label: `ACM-${i + 1}` }));
  const p = placeLabels(bars, 1262);
  // The last one has the free space after it; none of the others may print over a bar that starts after it.
  p.forEach((pl, i) => {
    if (pl.inside) return;
    const end = bars[i].left + bars[i].width + 4 + pl.outsideWidth;
    for (const other of bars) if (other.left > bars[i].left + 0.5) assert.ok(end <= other.left, `label ${i} runs over a bar at ${other.left}`);
  });
  assert.equal(p[0].inside, true, "no room beside a bar that overlaps the next: the name stays inside, cut");
  assert.equal(p[6].inside, false, "the last clip has room after it");
});

test("V18-T-11: the zoom tool's cursor zooms out while Alt is held", () => {
  assert.equal(cursorFor("zoom", false), "cursor-zoom-in");
  assert.equal(cursorFor("zoom", true), "cursor-zoom-out");
  assert.equal(cursorFor("hand", true), "cursor-grab", "Alt changes only the zoom tool");
});

test("V18-T-8: a slider position maps to a zoom and stays inside 0 to 100", () => {
  assert.equal(zoomFromX(150, 100, 100), 50);
  assert.equal(zoomFromX(50, 100, 100), 0);
  assert.equal(zoomFromX(500, 100, 100), 100);
  assert.equal(zoomFromX(150, 100, 0), 0);
});

import { packRows } from "./laneTools";

test("V18-T-6: bars that overlap stack into rows; a lone bar stays full height", () => {
  const slots = packRows([
    { left: 0, width: 18 },
    { left: 10, width: 18 },
    { left: 20, width: 18 },
    { left: 200, width: 18 },
  ]);
  assert.deepEqual(slots[0], { row: 0, rows: 2 });
  assert.deepEqual(slots[1], { row: 1, rows: 2 });
  assert.deepEqual(slots[2], { row: 0, rows: 2 }); // fits after the first ended at 18
  assert.deepEqual(slots[3], { row: 0, rows: 1 });
  assert.equal(new Set(slots.slice(0, 3).map((s) => `${s.row}`)).size, 2);
});

test("V18-T-6: packed rows never overlap inside a row", () => {
  const bars = Array.from({ length: 30 }, (_, i) => ({ left: i * 5, width: 18 }));
  const slots = packRows(bars);
  for (let i = 0; i < bars.length; i++)
    for (let j = i + 1; j < bars.length; j++)
      if (slots[i].row === slots[j].row)
        assert.ok(bars[j].left >= bars[i].left + bars[i].width || bars[i].left >= bars[j].left + bars[j].width);
});
