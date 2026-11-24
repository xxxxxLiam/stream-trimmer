/**
 * File: tipsSeen.test.ts
 * Description: A tip shows once and not again after Got it; turning tips off stops them all; a
 *   version bump shows it once more; Replay forgets only the open panels' tips; steps stay at three.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MAX_TIP_STEPS, TIPS, type Tip } from "./tipRegistry";
import { forgetOpen, markSeen, nextTip, normalizeSeen } from "./tipsSeen";

const T: Tip[] = [
  { id: "a", version: 1, name: "A", steps: [{ target: "#a", text: "x" }] },
  { id: "b", version: 1, name: "B", steps: [{ target: "#b", text: "y" }] },
];
const all = () => true;

test("a tip shows once, and not again after Got it", () => {
  assert.equal(nextTip(T, {}, true, all)?.id, "a");
  const seen = markSeen({}, T[0]);
  assert.equal(nextTip(T, seen, true, all)?.id, "b");
  assert.equal(nextTip(T, markSeen(seen, T[1]), true, all), null);
});

test("tips off shows nothing", () => {
  assert.equal(nextTip(T, {}, false, all), null);
});

test("a tip waits until its control is on screen", () => {
  assert.equal(nextTip(T, {}, true, (s) => s === "#b")?.id, "b");
});

test("raising the version shows it once more", () => {
  const seen = markSeen({}, T[0]);
  assert.equal(nextTip([{ ...T[0], version: 2 }], seen, true, all)?.id, "a");
});

test("Replay forgets only tips of panels that are open", () => {
  const seen = { a: 1, b: 1 };
  assert.deepEqual(forgetOpen(T, seen, (s) => s === "#a"), { b: 1 });
});

test("a damaged saved list reads as empty", () => {
  assert.deepEqual(normalizeSeen("nope"), {});
  assert.deepEqual(normalizeSeen({ a: "x", b: 2 }), { b: 2 });
});

test("every real tip has one to three steps", () => {
  for (const t of TIPS) assert.ok(t.steps.length >= 1 && t.steps.length <= MAX_TIP_STEPS, t.id);
});
