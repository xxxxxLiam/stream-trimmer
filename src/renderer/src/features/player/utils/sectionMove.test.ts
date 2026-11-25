/**
 * File: sectionMove.test.ts
 * Description: Moving a range keeps its length inside the video; touching sections read as one.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { movedRange, touching } from "./sectionMove";

test("a moved range keeps its length and follows the pointer by where it was grabbed", () => {
  assert.deepEqual(movedRange(42, 10, 500, 1000), { start: 490, end: 532 });
  assert.deepEqual(movedRange(42, 10, 500.4, 1000), { start: 490, end: 532 }, "whole seconds");
});

test("a moved range never leaves the video, at either end", () => {
  assert.deepEqual(movedRange(42, 10, 3, 1000), { start: 0, end: 42 });
  assert.deepEqual(movedRange(42, 10, 5000, 1000), { start: 958, end: 1000 });
  assert.deepEqual(movedRange(2000, 0, 5, 1000), { start: 0, end: 2000 }, "longer than the video stays put");
});

test("touching: a range meeting or overlapping a section reads as one range with it", () => {
  const sections = [{ start: 100, end: 130 }, { start: 400, end: 430 }];
  assert.equal(touching({ start: 200, end: 240 }, sections, 2), null);
  assert.deepEqual(touching({ start: 131, end: 160 }, sections, 2), { union: { start: 100, end: 160 }, indices: [0] });
  assert.deepEqual(touching({ start: 110, end: 140 }, sections, 0), { union: { start: 100, end: 140 }, indices: [0] }, "overlap");
  assert.deepEqual(touching({ start: 380, end: 399 }, sections, 2), { union: { start: 380, end: 430 }, indices: [1] });
  assert.equal(touching({ start: 133, end: 160 }, sections, 2), null, "outside the tolerance");
});

test("touching: a range that bridges two sections joins all three", () => {
  const sections = [{ start: 100, end: 130 }, { start: 140, end: 170 }];
  assert.deepEqual(touching({ start: 128, end: 142 }, sections, 0), { union: { start: 100, end: 170 }, indices: [0, 1] });
});

import { pickSection } from "./sectionMove";

test("pickSection: the selected range wins, then locked sections; edges before bodies; none outside", () => {
  const xOf = (t: number) => t; // 1 px per second
  const edgeOf = (x: number, a: number, b: number) => (Math.abs(x - a) <= 4 ? ("start" as const) : Math.abs(x - b) <= 4 ? ("end" as const) : null);
  const cands = [
    { id: "range" as const, r: { start: 100, end: 140 } },
    { id: 0, r: { start: 300, end: 360 } },
    { id: 1, r: { start: 500, end: 520 } },
  ];
  assert.deepEqual(pickSection(120, cands, xOf, edgeOf), { id: "range", r: cands[0].r, edge: null });
  assert.deepEqual(pickSection(330, cands, xOf, edgeOf), { id: 0, r: cands[1].r, edge: null });
  assert.deepEqual(pickSection(303, cands, xOf, edgeOf), { id: 0, r: cands[1].r, edge: "start" });
  assert.deepEqual(pickSection(521, cands, xOf, edgeOf), { id: 1, r: cands[2].r, edge: "end" });
  assert.equal(pickSection(200, cands, xOf, edgeOf), null);
  assert.equal(pickSection(5, [], xOf, edgeOf), null);
});
