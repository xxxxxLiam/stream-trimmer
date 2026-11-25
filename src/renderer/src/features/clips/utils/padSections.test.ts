import assert from "node:assert/strict";
import test from "node:test";
import { CLIP_PADDING_SEC, padSections } from "./padSections";

test("C-3: each marked section grows by the extra seconds at both ends", () => {
  assert.deepEqual(padSections([{ start: 4400, end: 4415 }], 2, 8000), [{ start: 4398, end: 4417 }]);
  assert.deepEqual(padSections([{ start: 4400, end: 4415 }], 0, 8000), [{ start: 4400, end: 4415 }]);
})

test("Liam 25 Nov: the padding is always 5 seconds at both ends", () => {
  assert.equal(CLIP_PADDING_SEC, 5);
  assert.deepEqual(padSections([{ start: 100, end: 120 }], undefined, 8000), [{ start: 95, end: 125 }]);
});

test("C-3: padding stays inside the video", () => {
  assert.deepEqual(padSections([{ start: 0.5, end: 10 }], 2, 11), [{ start: 0, end: 11 }]);
});

test("C-3: sections that run into each other after padding become one, so nothing is cut twice", () => {
  assert.deepEqual(
    padSections([{ start: 100, end: 110 }, { start: 112, end: 120 }, { start: 300, end: 310 }], 2, 1000),
    [{ start: 98, end: 122 }, { start: 298, end: 312 }],
  );
});
