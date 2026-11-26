import assert from "node:assert/strict";
import test from "node:test";
import { HOLD_MS, holdProgress } from "./useHold";

test("a hold fills over 3 seconds and never passes 1 or goes below 0", () => {
  assert.equal(HOLD_MS, 3000);
  assert.equal(holdProgress(0), 0);
  assert.equal(holdProgress(1500), 0.5);
  assert.equal(holdProgress(3000), 1);
  assert.equal(holdProgress(9000), 1);
  assert.equal(holdProgress(-5), 0);
});
