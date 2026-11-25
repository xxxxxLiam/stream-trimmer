/**
 * File: transcriptOutcome.test.ts
 * Path: src/renderer/src/shared/utils/transcriptOutcome.test.ts
 * Description: A failed transcript fetch carries its sentence; a video with no captions carries none.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { transcriptOutcome, TRANSCRIPT_REQUEST_FAILED } from "./transcriptOutcome";

const line = { start: 0, end: 1, text: "hi" } as any;

test("passes lines through", () => {
  assert.deepEqual(transcriptOutcome({ lines: [line], available: true }), { lines: [line], error: null });
});
test("a video with no captions has no error", () => {
  assert.deepEqual(transcriptOutcome({ lines: [], available: false }), { lines: [], error: null });
});
test("a failed fetch carries its sentence", () => {
  const out = transcriptOutcome({ lines: [], available: false, failed: true, error: "YouTube refused." });
  assert.equal(out.error, "YouTube refused.");
});
test("a request that never answered is a failure", () => {
  assert.equal(transcriptOutcome(null).error, TRANSCRIPT_REQUEST_FAILED);
});
