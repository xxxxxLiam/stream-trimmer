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
    clipReason({ hasRange: true, segments: 0, totalSeconds: 1000 }),
    "Clips can be up to 10 minutes. This one is 16:40.",
  );
  assert.equal(clipReason({ hasRange: true, segments: 0, totalSeconds: 42 }), null);
});

test("an In with no Out, or an Out with no In, is no range", () => {
  assert.equal(pickedRangeOf({ ...over, endText: "", validationError: "" }), null);
  assert.equal(pickedRangeOf({ ...over, startText: "", validationError: "" }), null);
});

test("the cap applies to the joined total, not the last range", () => {
  // 5:30 locked + 5:30 marked: each fine alone, 11:00 together
  assert.equal(
    clipReason({ hasRange: true, segments: 1, totalSeconds: 660 }),
    "Clips can be up to 10 minutes. This one is 11:00.",
  );
  assert.equal(clipReason({ hasRange: false, segments: 1, totalSeconds: 660 }), "Clips can be up to 10 minutes. This one is 11:00.");
});

test("one end alone says which end is missing", () => {
  assert.equal(clipReason({ hasRange: false, segments: 0, startSet: true, endSet: false }), "Set an end first: click the timeline or press O");
  assert.equal(clipReason({ hasRange: false, segments: 0, startSet: false, endSet: true }), "Set a start first: click the timeline or press I");
  assert.equal(clipReason({ hasRange: false, segments: 0, startSet: true, endSet: true }), "The end has to come after the start");
  assert.equal(clipReason({ hasRange: false, segments: 0 }), "Set an end first: click the timeline or press O");
});
