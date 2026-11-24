/**
 * File: filmstrip.test.ts
 * Path: src/renderer/src/features/player/utils/filmstrip.test.ts
 * Description: Storyboard cell lookup and level choice for the Source lane filmstrip.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { frameAt, levelForHeight } from "./filmstrip";

const level = {
  id: "sb1",
  width: 160,
  height: 90,
  columns: 5,
  rows: 5,
  fps: 0.5,
  sheets: [
    { url: "a", duration: 50 },
    { url: "b", duration: 50 },
  ],
};

test("a time lands in the right sheet, column and row", () => {
  assert.deepEqual(frameAt(level, 0), { sheet: 0, col: 0, row: 0 });
  assert.deepEqual(frameAt(level, 2), { sheet: 0, col: 1, row: 0 });
  assert.deepEqual(frameAt(level, 10), { sheet: 0, col: 0, row: 1 });
  assert.deepEqual(frameAt(level, 50), { sheet: 1, col: 0, row: 0 });
  assert.equal(frameAt(level, 5000).sheet, 1);
});

test("the level is the smallest that still fills the lane", () => {
  const small = { ...level, id: "s", height: 45 };
  assert.equal(levelForHeight([level, small], 32)?.id, "s");
  assert.equal(levelForHeight([level, small], 60)?.id, "sb1");
  assert.equal(levelForHeight([level, small], 500)?.id, "sb1");
  assert.equal(levelForHeight([], 32), null);
  assert.equal(levelForHeight(undefined, 32), null);
});
