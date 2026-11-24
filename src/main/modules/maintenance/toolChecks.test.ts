/**
 * File: toolChecks.test.ts
 * Path: src/main/modules/maintenance/toolChecks.test.ts
 * Description: The launch check for a newer yt-dlp runs at most once a day.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { toolCheckDue } from "./toolChecks";

const NOW = 1_800_000_000_000;
test("never checked, or a day ago: due", () => {
  assert.equal(toolCheckDue(undefined, NOW), true);
  assert.equal(toolCheckDue(NOW - 24 * 3600_000, NOW), true);
});
test("checked within the day: not due", () => {
  assert.equal(toolCheckDue(NOW - 23 * 3600_000, NOW), false);
});
test("a timestamp from the future (clock moved) counts as due", () => {
  assert.equal(toolCheckDue(NOW + 1000, NOW), true);
});
