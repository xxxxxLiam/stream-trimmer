/**
 * File: videoActivity.test.ts
 * Path: src/renderer/src/shared/utils/videoActivity.test.ts
 * Description: Pins the last-clipped-from record and that adding and clipping both feed the Videos order.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { normalizeActivity, touched } from "./videoActivity";

test("touched moves a video to the new time and never backwards", () => {
  const m = { a: 100 };
  assert.deepEqual(touched(m, "b", 50), { a: 100, b: 50 });
  assert.equal(touched(m, "a", 90), m);
  assert.deepEqual(touched(m, "a", 150), { a: 150 });
  assert.equal(touched(m, "", 500), m);
});

test("normalizeActivity keeps real times only", () => {
  assert.deepEqual(normalizeActivity({ a: 5, b: "x", c: -1, d: NaN }), { a: 5 });
  assert.deepEqual(normalizeActivity(null), {});
});

test("adding a video stamps it, a finished clip touches its video, and the list reads both", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.match(read("../../features/workspace/hooks/WorkspaceContext.tsx"), /url: link, addedAt: Date\.now\(\)/);
  assert.match(read("../../modules/clipper/hooks/useClipDownloadMutations.ts"), /activityStore\.touch\(extractVideoId\(url\)\)/);
  assert.match(read("../../features/workspace/hooks/useVideosController.ts"), /byLatestActivity\(open, \(id\) => activity\[id\] \?\? 0\)/);
});
