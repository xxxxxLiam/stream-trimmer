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
  assert.deepEqual(transcriptOutcome({ lines: [line], available: true }), { lines: [line], error: null, kind: null });
});
test("a video with no captions has no error", () => {
  assert.deepEqual(transcriptOutcome({ lines: [], available: false }), { lines: [], error: null, kind: null });
});
test("a failed fetch carries its sentence", () => {
  const out = transcriptOutcome({ lines: [], available: false, failed: true, error: "YouTube refused." });
  assert.equal(out.error, "YouTube refused.");
});
test("a request that never answered is a failure", () => {
  assert.equal(transcriptOutcome(null).error, TRANSCRIPT_REQUEST_FAILED);
});

// The one thing a "sign in to YouTube" prompt needs that the sentence alone doesn't give: which
// failure this was. Dropping it here would silently take that choice away from every caller.
test("a failed fetch carries the engine's reason kind, so a caller can offer to sign in on an auth-shaped failure", () => {
  const out = transcriptOutcome({ lines: [], available: false, failed: true, error: "YouTube refused the request for this video.", kind: "refused" });
  assert.equal(out.kind, "refused");
});
test("a fetch with no failure, or one the engine sent no kind for, carries none", () => {
  assert.equal(transcriptOutcome({ lines: [line], available: true }).kind, null);
  assert.equal(transcriptOutcome(null).kind, null);
  assert.equal(
    transcriptOutcome({ lines: [], available: false, failed: true, error: "Couldn't read this video's captions." }).kind,
    null,
  );
});

import { transcriptSignInHelps } from "./transcriptOutcome";
test("board 03.2.56: only a refused or sign-in-shaped transcript failure offers Sign in", () => {
  for (const k of ["refused", "signin", "age"]) assert.equal(transcriptSignInHelps(k), true, k);
  for (const k of [null, undefined, "private", "removed", "live", "region", "members"]) assert.equal(transcriptSignInHelps(k), false, String(k));
});
