/**
 * File: columnSizes.test.ts
 * Description: Clamping, distribution, keyboard moves and persistence parsing for the
 *   resizable workspace columns.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_CENTRE_PX,
  MIN_SIDE_PX,
  ROW_CHROME_PX,
  applyMove,
  boundsFor,
  clampWidth,
  defaultWidths,
  dragWidth,
  moveForKey,
  parseStored,
  resolveWidths,
  serializeStored,
} from "./columnSizes";

const centreOf = (w: { transcript: number; clips: number }, cw: number) =>
  cw - ROW_CHROME_PX - w.transcript - w.clips;

test("clamp: a column can never reach 0 or go under the minimum", () => {
  assert.equal(clampWidth("transcript", 0, 1200, 220), MIN_SIDE_PX);
  assert.equal(clampWidth("clips", -50, 1200, 220), MIN_SIDE_PX);
  assert.equal(clampWidth("clips", NaN, 1200, 220), MIN_SIDE_PX);
});

test("clamp: the centre column keeps its floor however far a side is dragged", () => {
  const w = clampWidth("transcript", 5000, 1000, 300);
  assert.equal(centreOf({ transcript: w, clips: 300 }, 1000) >= MIN_CENTRE_PX, true);
  assert.equal(w, 1000 - ROW_CHROME_PX - MIN_CENTRE_PX - 300);
});

test("clamp: at the narrowest wide container both sides at minimum still fit", () => {
  const b = boundsFor("transcript", 840, MIN_SIDE_PX);
  assert.ok(b.max >= b.min);
  assert.ok(centreOf({ transcript: b.min, clips: MIN_SIDE_PX }, 840) >= MIN_CENTRE_PX);
});

test("defaults follow the stylesheet's two steps", () => {
  assert.deepEqual(defaultWidths(900), { transcript: 240, clips: 220 });
  assert.deepEqual(defaultWidths(1200), { transcript: 280, clips: 260 });
});

test("resolve: unset gives defaults; stored values are kept when they fit", () => {
  assert.deepEqual(resolveWidths({ transcript: null, clips: null }, 1200), { transcript: 280, clips: 260 });
  assert.deepEqual(resolveWidths({ transcript: 350, clips: 300 }, 1400), { transcript: 350, clips: 300 });
});

test("resolve: a narrower container squeezes the sides, never the centre floor", () => {
  const w = resolveWidths({ transcript: 540, clips: 460 }, 900);
  assert.ok(centreOf(w, 900) >= MIN_CENTRE_PX);
  assert.ok(w.transcript >= MIN_SIDE_PX && w.clips >= MIN_SIDE_PX);
});

test("drag: transcript grows with the pointer, clips shrinks with it", () => {
  const cur = { transcript: 280, clips: 260 };
  assert.equal(dragWidth("transcript", 280, 40, cur, 1400), 320);
  assert.equal(dragWidth("clips", 260, 40, cur, 1400), 220);
  assert.equal(dragWidth("clips", 260, -40, cur, 1400), 300);
  assert.equal(dragWidth("transcript", 280, -999, cur, 1400), MIN_SIDE_PX);
});

test("keys: arrows follow the divider, Home/End go to the ends, others are ignored", () => {
  assert.equal(moveForKey("transcript", "ArrowRight"), "grow");
  assert.equal(moveForKey("transcript", "ArrowLeft"), "shrink");
  assert.equal(moveForKey("clips", "ArrowRight"), "shrink");
  assert.equal(moveForKey("clips", "ArrowLeft"), "grow");
  assert.equal(moveForKey("clips", "Home"), "min");
  assert.equal(moveForKey("clips", "End"), "max");
  assert.equal(moveForKey("clips", "a"), null);
});

test("applyMove: small step, large step, min and max", () => {
  const cur = { transcript: 280, clips: 260 };
  assert.equal(applyMove("transcript", "grow", cur, 1400), 296);
  assert.equal(applyMove("transcript", "grow", cur, 1400, true), 344);
  assert.equal(applyMove("transcript", "min", cur, 1400), MIN_SIDE_PX);
  assert.equal(applyMove("transcript", "max", cur, 1400), boundsFor("transcript", 1400, 260).max);
  assert.equal(applyMove("clips", "shrink", { transcript: 280, clips: MIN_SIDE_PX }, 1400), MIN_SIDE_PX);
});

test("parseStored rejects junk and rounds numbers; serialize drops unset sides", () => {
  assert.deepEqual(parseStored(null), { transcript: null, clips: null });
  assert.deepEqual(parseStored("x"), { transcript: null, clips: null });
  assert.deepEqual(parseStored({ transcript: -5, clips: "300" }), { transcript: null, clips: null });
  assert.deepEqual(parseStored({ transcript: 300.4, clips: Infinity }), { transcript: 300, clips: null });
  assert.equal(serializeStored({ transcript: null, clips: null }), null);
  assert.deepEqual(serializeStored({ transcript: 300, clips: null }), { transcript: 300 });
});
