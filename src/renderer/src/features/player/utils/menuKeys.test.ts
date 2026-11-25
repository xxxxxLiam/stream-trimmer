/**
 * File: menuKeys.test.ts
 * Path: src/renderer/src/features/player/utils/menuKeys.test.ts
 * Description: Arrow keys move through the Clip menu's rows and wrap; other keys do nothing.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { menuTarget } from "./menuKeys";

test("arrows step and wrap, Home and End jump", () => {
  assert.equal(menuTarget(0, 3, "ArrowDown"), 1);
  assert.equal(menuTarget(2, 3, "ArrowDown"), 0);
  assert.equal(menuTarget(0, 3, "ArrowUp"), 2);
  assert.equal(menuTarget(-1, 3, "ArrowDown"), 0);
  assert.equal(menuTarget(-1, 3, "ArrowUp"), 2);
  assert.equal(menuTarget(1, 3, "Home"), 0);
  assert.equal(menuTarget(1, 3, "End"), 2);
  assert.equal(menuTarget(1, 3, "x"), null);
  assert.equal(menuTarget(0, 0, "ArrowDown"), null);
});
