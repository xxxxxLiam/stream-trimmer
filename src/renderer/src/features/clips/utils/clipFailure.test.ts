import assert from "node:assert/strict";
import test from "node:test";
import { classifyClipFailure, isRetryingNote, rowFailure, failureActions, failureCopy, isRetryKey } from "./clipFailure";

test("codes map to the three failure rows", () => {
  assert.equal(classifyClipFailure("disk_full"), "disk");
  assert.equal(classifyClipFailure("save_folder_gone"), "disk");
  assert.equal(classifyClipFailure("private_video"), "private");
  assert.equal(classifyClipFailure(undefined), "stopped");
  assert.equal(classifyClipFailure("unknown"), "stopped");
});

test("each row says the approved words", () => {
  assert.deepEqual(failureCopy("disk", 1), {
    reason: "There isn’t enough space to save it.",
    detail: "It waits here until it has somewhere to go.",
  });
  assert.deepEqual(failureCopy("private", 1), {
    reason: "This video is private, so it can’t be downloaded.",
    detail: "Your range is kept.",
  });
  assert.equal(failureCopy("stopped", 1).detail, "Clipr is updating its download tools and will try once more.");
  assert.equal(failureCopy("stopped", 2).detail, "", "after the retry also failed the row says only the reason");
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

test("the engine's row state decides the kind and whether the retry was spent", () => {
  assert.deepEqual(rowFailure({ state: "failed", reason: "x", retrying: false }), { kind: "stopped", attempts: 1 });
  assert.deepEqual(rowFailure({ state: "failed", reason: "x", retrying: true }), { kind: "stopped", attempts: 1 });
  assert.deepEqual(rowFailure({ state: "failed-final", reason: "x" }), { kind: "stopped", attempts: 2 });
  assert.deepEqual(rowFailure({ state: "no-space", reason: "x" }), { kind: "disk", attempts: 1 });
  assert.deepEqual(rowFailure({ state: "cannot-download", kind: "private", reason: "x" }), { kind: "private", attempts: 1 });
  assert.deepEqual(rowFailure({ state: "cannot-download", kind: "other", reason: "Members only." }), {
    kind: "private",
    attempts: 1,
    reason: "Members only.",
  });
  assert.equal(failureCopy("private", 1, "Members only.").reason, "Members only.");
});

test("the retry sentence is recognised while the engine retries", () => {
  assert.equal(isRetryingNote("Clipr is updating its download tools and will try once more."), true);
  assert.equal(isRetryingNote("Downloading"), false);
});

test("C-8: a failure with a network cause says so and does not promise a retry that is not happening", () => {
  assert.equal(classifyClipFailure(undefined, "getaddrinfo ENOTFOUND www.youtube.com"), "offline");
  assert.equal(classifyClipFailure(undefined, "Network is unreachable"), "offline");
  assert.equal(classifyClipFailure(undefined, "ERROR: Sign in to confirm you’re not a bot"), "stopped");
  assert.equal(classifyClipFailure("private_video", "timed out"), "private", "a code of its own wins");
  assert.equal(failureCopy("offline", 1).reason, "No internet connection.");
  assert.doesNotMatch(failureCopy("offline", 1).detail, /try once more/);
  assert.equal(failureCopy("offline", 2).detail, "", "after the second failure the row says only the reason");
  assert.deepEqual(failureActions("offline", 2), ["retry", "copyDetails"]);
});

test("C-6: a full or unwritable folder says so, with Change folder and no retry of the download", () => {
  assert.equal(failureCopy("disk", 1, "The Clips folder is full.").reason, "The Clips folder is full.");
  assert.equal(failureCopy("disk", 1, "Clipr can’t write to that folder.").reason, "Clipr can’t write to that folder.");
  assert.deepEqual(failureActions("disk", 1), ["changeFolder"]);
});

test("B2-2: the engine's cap error says the real reason and offers no Retry", () => {
  const kind = classifyClipFailure(undefined, "Clip length capped at 600 seconds (10 minutes)");
  assert.equal(kind, "toolong");
  assert.equal(failureCopy(kind, 1).reason, "Clips can be up to 10 minutes.");
  assert.doesNotMatch(failureCopy(kind, 1).detail, /try once more/i);
  assert.deepEqual(failureActions(kind, 1), []);
  assert.deepEqual(failureActions(kind, 2), []);
});
