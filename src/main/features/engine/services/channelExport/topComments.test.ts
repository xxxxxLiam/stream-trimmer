/**
 * File: topComments.test.ts
 * Path: src/main/features/engine/services/channelExport/topComments.test.ts
 * Description: Only top-level comments, most liked first, capped, with the replies seen under each.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { topComments } from "./topComments";

test("top-level comments by likes, replies counted under their parent and not listed", () => {
  const raw = [
    { id: "a", parent: "root", like_count: 5 },
    { id: "a.1", parent: "a", like_count: 99 },
    { id: "a.2", parent: "a", like_count: 1 },
    { id: "b", parent: "root", like_count: 40 },
    { id: "c", parent: "root", like_count: null },
  ];
  const out = topComments(raw, 2);
  assert.deepEqual(out.map((c) => [c.id, c.replies]), [["b", 0], ["a", 2]]);
});
