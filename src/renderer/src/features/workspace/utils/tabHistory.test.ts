/**
 * File: tabHistory.test.ts
 * Path: src/renderer/src/features/workspace/utils/tabHistory.test.ts
 * Description: B2-1 — Back after a failed open returns to the video you were on, and a failed link is not saved.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { abandon, backTarget, savedWorkspace } from "./tabHistory";

const tabs = [
  { id: "a", name: "", url: "https://youtu.be/AAA", campaignId: "acme" },
  { id: "b", name: "", url: "https://youtu.be/BBB", campaignId: "nova" },
  { id: "x", name: "", url: "https://example.com/nope" },
];

test("B2-1: Back goes to the video you were on, not the last one in the list", () => {
  assert.equal(backTarget(tabs, { x: "a" }, "x"), "a");
  assert.equal(backTarget(tabs, { x: "b" }, "x"), "b");
  assert.equal(backTarget(tabs, {}, "x"), null);
  assert.equal(backTarget(tabs, { x: "gone" }, "x"), null);
});

test("B2-1: a link that never opened is not saved, and the saved active video is the one before it", () => {
  const saved = savedWorkspace(tabs, "x", { x: true }, { x: "a" });
  assert.deepEqual(saved.tabs.map((t) => t.id), ["a", "b"]);
  assert.equal(saved.activeId, "a");
  const opened = savedWorkspace(tabs, "x", {}, { x: "a" });
  assert.deepEqual(opened.tabs.map((t) => t.id), ["a", "b", "x"]);
});

test("B2-1: Back removes the failed video and shows the one you came from, also after a second failure", () => {
  const first = abandon(tabs, { x: "a" }, "x");
  assert.deepEqual(first.tabs.map((t) => t.id), ["a", "b"]);
  assert.equal(first.activeId, "a");
  // Nothing left to come from: the first other open video.
  const again = abandon(first.tabs, {}, "a");
  assert.equal(again.activeId, "b");
});
