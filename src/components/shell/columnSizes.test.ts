/**
 * File: columnSizes.test.ts
 * Description: Clamping, distribution, keyboard moves, collapse and persistence parsing for
 *   the resizable, collapsible workspace columns.
 */
import assert from "node:assert/strict";
import test from "node:test";
import {
  MIN_CENTRE_PX,
  MIN_SIDE_PX,
  RAIL_PX,
  ROW_CHROME_PX,
  applyMove,
  boundsFor,
  clampWidth,
  defaultWidths,
  dragWidth,
  moveForKey,
  occupied,
  parseStored,
  resolveWidths,
  serializeStored,
  toggleCollapsed,
  type Collapsed,
  type StoredWidths,
  type Widths,
} from "./columnSizes";

const NONE: Collapsed = { transcript: false, clips: false };
const W = (transcript: number, clips: number, collapsed: Collapsed = NONE): Widths => ({ transcript, clips, collapsed });
const S = (transcript: number | null, clips: number | null, collapsed: Collapsed = NONE): StoredWidths => ({
  transcript,
  clips,
  collapsed,
});
const centreOf = (w: Widths, cw: number) => cw - ROW_CHROME_PX - occupied("transcript", w) - occupied("clips", w);

test("clamp: a column can never reach 0 or go under the minimum", () => {
  assert.equal(clampWidth("transcript", 0, 1200, 220), MIN_SIDE_PX);
  assert.equal(clampWidth("clips", -50, 1200, 220), MIN_SIDE_PX);
  assert.equal(clampWidth("clips", NaN, 1200, 220), MIN_SIDE_PX);
});

test("clamp: the centre column keeps its floor however far a side is dragged", () => {
  const w = clampWidth("transcript", 5000, 1000, 300);
  assert.equal(centreOf(W(w, 300), 1000) >= MIN_CENTRE_PX, true);
  assert.equal(w, 1000 - ROW_CHROME_PX - MIN_CENTRE_PX - 300);
});

test("clamp: at the narrowest wide container both sides at minimum still fit", () => {
  const b = boundsFor("transcript", 840, MIN_SIDE_PX);
  assert.ok(b.max >= b.min);
  assert.ok(centreOf(W(b.min, MIN_SIDE_PX), 840) >= MIN_CENTRE_PX);
});

test("defaults follow the stylesheet's two steps and start uncollapsed", () => {
  assert.deepEqual(defaultWidths(900), W(240, 220));
  assert.deepEqual(defaultWidths(1200), W(280, 260));
});

test("resolve: unset gives defaults; stored values are kept when they fit", () => {
  assert.deepEqual(resolveWidths(S(null, null), 1200), W(280, 260));
  assert.deepEqual(resolveWidths(S(350, 300), 1400), W(350, 300));
});

test("resolve: a narrower container squeezes the sides, never the centre floor", () => {
  const w = resolveWidths(S(540, 460), 900);
  assert.ok(centreOf(w, 900) >= MIN_CENTRE_PX);
  assert.ok(w.transcript >= MIN_SIDE_PX && w.clips >= MIN_SIDE_PX);
});

test("drag: transcript grows with the pointer, clips shrinks with it", () => {
  const cur = W(280, 260);
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
  const cur = W(280, 260);
  assert.equal(applyMove("transcript", "grow", cur, 1400), 296);
  assert.equal(applyMove("transcript", "grow", cur, 1400, true), 344);
  assert.equal(applyMove("transcript", "min", cur, 1400), MIN_SIDE_PX);
  assert.equal(applyMove("transcript", "max", cur, 1400), boundsFor("transcript", 1400, 260).max);
  assert.equal(applyMove("clips", "shrink", W(280, MIN_SIDE_PX), 1400), MIN_SIDE_PX);
});

test("parseStored rejects junk and rounds numbers; serialize drops unset sides", () => {
  assert.deepEqual(parseStored(null), S(null, null));
  assert.deepEqual(parseStored("x"), S(null, null));
  assert.deepEqual(parseStored({ transcript: -5, clips: "300" }), S(null, null));
  assert.deepEqual(parseStored({ transcript: 300.4, clips: Infinity }), S(300, null));
  assert.equal(serializeStored(S(null, null)), null);
  assert.deepEqual(serializeStored(S(300, null)), { transcript: 300 });
});

test("compat: a value written before collapse existed loads, uncollapsed, and round-trips unchanged", () => {
  const old = { transcript: 310, clips: 270 };
  const parsed = parseStored(old);
  assert.deepEqual(parsed, S(310, 270));
  assert.deepEqual(serializeStored(parsed), old);
});

test("collapse: persists, round-trips, and ignores non-true junk", () => {
  const s = toggleCollapsed(S(310, null), "clips");
  assert.deepEqual(s.collapsed, { transcript: false, clips: true });
  assert.deepEqual(serializeStored(s), { transcript: 310, collapsed: { clips: true } });
  assert.deepEqual(parseStored(serializeStored(s)), s);
  assert.deepEqual(parseStored({ collapsed: { transcript: "yes", clips: 1 } }).collapsed, NONE);
  assert.deepEqual(parseStored({ collapsed: 5 }).collapsed, NONE);
  // Collapsed with no custom widths is still worth saving.
  assert.deepEqual(serializeStored(toggleCollapsed(S(null, null), "transcript")), { collapsed: { transcript: true } });
});

test("collapse: toggling twice restores the stored width untouched", () => {
  const a = S(333, 288);
  const back = toggleCollapsed(toggleCollapsed(a, "transcript"), "transcript");
  assert.deepEqual(back, a);
  assert.equal(resolveWidths(toggleCollapsed(a, "transcript"), 1400).transcript, 333);
});

test("collapse: both side columns can be collapsed and the centre survives, wider than ever", () => {
  const both = { transcript: true, clips: true };
  for (const cw of [840, 1000, 1400]) {
    const w = resolveWidths(S(null, null, both), cw);
    assert.equal(centreOf(w, cw), cw - ROW_CHROME_PX - 2 * RAIL_PX);
    assert.ok(centreOf(w, cw) >= MIN_CENTRE_PX);
    assert.ok(centreOf(w, cw) > centreOf(resolveWidths(S(null, null), cw), cw));
  }
});

test("collapse: the open column may use the room a collapsed neighbour gave up", () => {
  const open = boundsFor("transcript", 1000, 260).max;
  const w = resolveWidths(S(900, 260, { transcript: false, clips: true }), 1000);
  assert.equal(w.transcript, boundsFor("transcript", 1000, RAIL_PX).max);
  assert.ok(w.transcript > open);
  assert.ok(centreOf(w, 1000) >= MIN_CENTRE_PX);
});
