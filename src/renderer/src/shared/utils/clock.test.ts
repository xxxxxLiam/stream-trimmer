import assert from "node:assert/strict";
import test from "node:test";
import { formatClock } from "./clock";

test("formatClock writes times the way the boards do", () => {
  assert.equal(formatClock(4329), "1:12:09");
  assert.equal(formatClock(514), "8:34");
  assert.equal(formatClock(0), "0:00");
  assert.equal(formatClock(3600), "1:00:00");
  assert.equal(formatClock(-5), "0:00");
});
