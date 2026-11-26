/**
 * File: assetsLibraryRecord.test.ts
 * Path: src/main/features/editor/services/assetsLibraryRecord.test.ts
 * Description: Pure duplicate-tracking logic for "Add to Final Cut" — per-library, not global.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { newClips, withAdded } from "./assetsLibraryRecord";

test("newClips drops files already recorded for that library", () => {
  const record = { "/L/A.fcpbundle": ["/clips/one.mp4"] };
  assert.deepEqual(newClips(record, "/L/A.fcpbundle", ["/clips/one.mp4", "/clips/two.mp4"]), ["/clips/two.mp4"]);
});

test("newClips keeps every file for a library never seen before", () => {
  const record = { "/L/A.fcpbundle": ["/clips/one.mp4"] };
  assert.deepEqual(newClips(record, "/L/B.fcpbundle", ["/clips/one.mp4"]), ["/clips/one.mp4"]);
});

test("the same file added to two different libraries is new to each", () => {
  const record = withAdded({}, "/L/A.fcpbundle", ["/clips/one.mp4"]);
  assert.deepEqual(newClips(record, "/L/B.fcpbundle", ["/clips/one.mp4"]), ["/clips/one.mp4"]);
});

test("withAdded merges without duplicating and leaves other libraries untouched", () => {
  const before = { "/L/A.fcpbundle": ["/clips/one.mp4"] };
  const after = withAdded(before, "/L/A.fcpbundle", ["/clips/one.mp4", "/clips/two.mp4"]);
  assert.deepEqual(after["/L/A.fcpbundle"].sort(), ["/clips/one.mp4", "/clips/two.mp4"]);
  assert.deepEqual(before, { "/L/A.fcpbundle": ["/clips/one.mp4"] }, "withAdded must not mutate its input");
});

test("withAdded is a no-op for an empty file list or an unnamed library", () => {
  const before = { "/L/A.fcpbundle": ["/clips/one.mp4"] };
  assert.deepEqual(withAdded(before, "/L/A.fcpbundle", []), before);
  assert.deepEqual(withAdded(before, null, ["/clips/two.mp4"]), before);
});

// Negative control: a naive "global, not per-library" dedupe would wrongly treat the same path as a
// duplicate across libraries. Prove the real behaviour is per-library by checking what a broken,
// library-blind version would have gotten wrong.
test("negative control: dedupe really is scoped per library, not shared across all libraries", () => {
  const record = withAdded({}, "/L/A.fcpbundle", ["/clips/one.mp4"]);
  const brokenGlobalAdded = new Set(Object.values(record).flat());
  assert.ok(brokenGlobalAdded.has("/clips/one.mp4"), "sanity: the file is recorded somewhere");
  // The real function must NOT treat library B as already holding it.
  assert.deepEqual(newClips(record, "/L/B.fcpbundle", ["/clips/one.mp4"]), ["/clips/one.mp4"]);
});
