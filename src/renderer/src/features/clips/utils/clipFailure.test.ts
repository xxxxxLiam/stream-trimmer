import assert from "node:assert/strict";
import test from "node:test";
import { classifyClipFailure, failureActions, failureCopy, isRetryKey } from "./clipFailure";

test("codes map to the three failure rows", () => {
  assert.equal(classifyClipFailure("disk_full"), "disk");
  assert.equal(classifyClipFailure("save_folder_gone"), "disk");
  assert.equal(classifyClipFailure("private_video"), "private");
  assert.equal(classifyClipFailure(undefined), "stopped");
  assert.equal(classifyClipFailure("unknown"), "stopped");
});

test("each row says the approved words", () => {
  assert.deepEqual(failureCopy("disk", 1), {
    reason: "There isn't enough space to save it.",
    detail: "It waits here until it has somewhere to go.",
  });
  assert.deepEqual(failureCopy("private", 1), {
    reason: "This video is private, so it can't be downloaded.",
    detail: "Your range is kept.",
  });
  assert.equal(failureCopy("stopped", 1).detail, "Clipr is updating its download tools and will try once more.");
  assert.equal(failureCopy("stopped", 2).detail, "Your range is kept.");
});

test("Copy details joins Retry only after the retry also failed", () => {
  assert.deepEqual(failureActions("stopped", 1), ["retry"]);
  assert.deepEqual(failureActions("stopped", 2), ["retry", "copyDetails"]);
  assert.deepEqual(failureActions("disk", 1), ["changeFolder"]);
  assert.deepEqual(failureActions("private", 1), ["showInBrowser", "saveForLater"]);
});

test("R retries; Cmd R and typing do not", () => {
  const base = { key: "r", metaKey: false, ctrlKey: false, altKey: false, target: { tagName: "DIV" } };
  assert.equal(isRetryKey(base), true);
  assert.equal(isRetryKey({ ...base, metaKey: true }), false);
  assert.equal(isRetryKey({ ...base, ctrlKey: true }), false);
  assert.equal(isRetryKey({ ...base, target: { tagName: "INPUT" } }), false);
  assert.equal(isRetryKey({ ...base, key: "b" }), false);
});
