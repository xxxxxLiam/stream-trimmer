/**
 * File: pickedRange.test.ts
 * Path: src/renderer/src/features/player/utils/pickedRange.test.ts
 * Description: A range over the cap stays picked and Clip says why; other bad ranges are no range.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { overCapMessage } from "../../../shared/utils/clip";
import { clipReason } from "./clipDestination";
import { pickedRangeOf } from "./pickedRange";

const over = { startText: "1:12:04", endText: "1:28:44", start: 4324, end: 5324, validationError: overCapMessage(1000) };

test("a range over the cap is kept, not wiped to no range", () => {
  assert.deepEqual(pickedRangeOf(over), { start: 4324, end: 5324 });
});

test("other invalid ranges are still no range", () => {
  assert.equal(pickedRangeOf({ ...over, validationError: "Start must be before end" }), null);
  assert.equal(pickedRangeOf({ ...over, startText: "", endText: "" }), null);
});

test("Clip says the real reason for an over-cap range", () => {
  assert.equal(
    clipReason({ hasRange: true, segments: 0, busy: false, rangeSeconds: 1000 }),
    "Clips can be up to 10 minutes. This one is 16:40.",
  );
  assert.equal(clipReason({ hasRange: true, segments: 0, busy: false, rangeSeconds: 42 }), null);
});
