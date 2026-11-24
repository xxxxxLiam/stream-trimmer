/**
 * File: flags.test.ts
 * Path: src/renderer/src/shared/utils/flags.test.ts
 * Description: Flag list rules: whole seconds, sorted, no duplicates, bad stored data dropped.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { normalizeFlags, withFlag, withoutFlag } from "./flags";

test("a flag is a whole second, kept sorted, and never twice", () => {
  assert.deepEqual(withFlag([10, 50], 30.9), [10, 30, 50]);
  assert.deepEqual(withFlag([10, 30], 30.2), [10, 30]);
  assert.deepEqual(withFlag([], -4), [0]);
});

test("removing a flag removes that second only", () => {
  assert.deepEqual(withoutFlag([10, 30, 50], 30.4), [10, 50]);
  assert.deepEqual(withoutFlag([10], 99), [10]);
});

test("stored flags are cleaned on load", () => {
  assert.deepEqual(normalizeFlags({ a: [5, 5, 2, "x", -1, NaN], b: "no", c: [] }), { a: [2, 5] });
  assert.deepEqual(normalizeFlags(null), {});
});
