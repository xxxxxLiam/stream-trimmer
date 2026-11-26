import assert from "node:assert/strict";
import test from "node:test";
import { classifyClipFailure, isRetryingNote, rowFailure, failureActions, failureCopy, isRetryKey, isWaitingForConnection } from "./clipFailure";

test("codes map to the three failure rows", () => {
  assert.equal(classifyClipFailure("disk_full"), "disk");
  assert.equal(classifyClipFailure("save_folder_gone"), "drivegone");
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
  assert.equal(failureCopy("stopped", 1).detail, "", "no retry is promised unless the engine says it is retrying");
  assert.equal(failureCopy("stopped", 1, undefined, true).detail, "Clipr is updating its download tools and will try once more.");
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
  assert.deepEqual(rowFailure({ state: "failed", reason: "x", retrying: false }), { kind: "stopped", attempts: 1, reason: "x" });
  assert.deepEqual(rowFailure({ state: "failed", reason: "x", retrying: true }), { kind: "stopped", attempts: 1, reason: "x", retrying: true });
  assert.deepEqual(rowFailure({ state: "failed-final", reason: "x" }), { kind: "stopped", attempts: 1, reason: "x", final: true });
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

test("C-8 / C2-5: each engine code says its own sentence and offers its own way on", () => {
  assert.equal(classifyClipFailure("network_dropped"), "offline");
  assert.equal(classifyClipFailure("sign_in_needed"), "age");
  assert.equal(classifyClipFailure("video_unavailable"), "removed");
  assert.equal(classifyClipFailure("unknown", "YouTube refused the media request for this video"), "refused");
  assert.equal(failureCopy("offline", 1).reason, "No internet connection.");
  assert.match(failureCopy("signin", 1).reason, /signed in/);
  assert.match(failureCopy("removed", 1).reason, /removed or isn’t available/);
  assert.match(failureCopy("refused", 1).reason, /refused/);
  for (const k of ["offline", "signin", "removed", "refused", "stopped"] as const) {
    assert.doesNotMatch(failureCopy(k, 1).detail, /try once more|download tools/, `${k} promises no retry`);
  }
  assert.deepEqual(failureActions("signin", 1), ["signIn", "retry"]);
  assert.deepEqual(failureActions("removed", 1), ["showInBrowser", "saveForLater"]);
});

test("C-8: Copy details joins after the second failed Retry for every kind that has Retry", () => {
  for (const k of ["offline", "refused", "stopped", "signin"] as const) {
    assert.ok(!failureActions(k, 1).includes("copyDetails"), `${k} first failure`);
    assert.ok(failureActions(k, 2).includes("copyDetails"), `${k} second failure`);
  }
});

test("E2-1 renderer half: the engine's new codes map, and a final row shows the engine's own sentence with Copy details", () => {
  assert.equal(classifyClipFailure("video_removed"), "removed");
  assert.equal(classifyClipFailure("bot_check"), "signin");
  assert.equal(classifyClipFailure("access_refused"), "refused");
  assert.equal(classifyClipFailure("rate_limited"), "ratelimited");
  assert.equal(classifyClipFailure("format_unavailable"), "format");
  assert.equal(classifyClipFailure("tools_missing"), "tools");
  assert.match(failureCopy("ratelimited", 1).reason, /slow down/);
  assert.deepEqual(failureCopy("format", 1), { reason: "YouTube gave no downloadable version.", detail: "Signing in often fixes this, and the transcript too. Your range is kept." }, "board 03.2.56");
  assert.doesNotMatch(JSON.stringify(failureCopy("format", 1)), /another quality/, "there is no quality picker to point at");
  assert.match(failureCopy("tools", 1).detail, /Restart Clipr/);
  assert.equal(failureCopy("refused", 1, "YouTube turned this download down.").reason, "YouTube turned this download down.");
  assert.equal(failureCopy("stopped", 1, "The engine's own words.").reason, "The engine's own words.");
  assert.deepEqual(failureActions("stopped", 1, true), ["retry", "copyDetails"]);
  assert.deepEqual(failureActions("format", 1, true), ["signIn", "retry"], "board 03.2.56: Sign in first, then Try again");
  assert.deepEqual(failureActions("format", 2, true), ["signIn", "retry", "copyDetails"]);
  assert.deepEqual(failureActions("offline", 1, true), ["retry"], "a kind with its own full sentence waits for the second failed Retry");
});

test("an engine sentence without its full stop gets one, so the next words do not run on", () => {
  assert.equal(failureCopy("refused", 1, "YouTube refused the media request for this video").reason, "YouTube refused the media request for this video.");
  assert.equal(failureCopy("stopped", 1, "Already ends well.").reason, "Already ends well.");
});

test("Offline: a dropped connection is a quiet waiting row, until it keeps failing while the machine says it is online", () => {
  assert.equal(isWaitingForConnection("offline", 1, false), true);
  assert.equal(isWaitingForConnection("offline", 5, false), true, "really offline: wait as long as it takes");
  assert.equal(isWaitingForConnection("offline", 2, true), true);
  assert.equal(isWaitingForConnection("offline", 3, true), false, "online but failing three times: show the failure row");
  assert.equal(isWaitingForConnection("stopped", 1, false), false);
});

test("Free space: a clip refused before it starts says the numbers, and still offers Change folder only", () => {
  const copy = failureCopy("disk", 1, "There isn’t enough space for this clip.", false, { neededMb: 183, freeMb: 60 });
  assert.equal(copy.reason, "There isn’t enough space for this clip.");
  assert.equal(copy.detail, "It needs about 180 MB and 60 MB is free. It waits here until it has somewhere to go.");
  assert.deepEqual(failureActions("disk", 1), ["changeFolder"]);
  assert.equal(failureCopy("disk", 1).detail, "It waits here until it has somewhere to go.", "a full disk found later keeps its old words");
});

test("folder rows say which cause it is, with the campaign's name", () => {
  assert.equal(classifyClipFailure("save_folder_gone", "The folder was renamed, deleted, or is on a drive that is no longer mounted"), "drivegone");
  assert.equal(classifyClipFailure("save_folder_gone", "Clipr can't write to that folder"), "norights");
  assert.equal(classifyClipFailure("folder_not_writable"), "norights");
  assert.deepEqual(failureCopy("drivegone", 1, undefined, false, undefined, "Acme"), {
    reason: "The drive with Acme’s folder isn’t connected.",
    detail: "Plug it back in and it carries on by itself, or pick another folder.",
  });
  assert.deepEqual(failureCopy("norights", 1, undefined, false, undefined, "Acme"), {
    reason: "Clipr isn’t allowed to save in Acme’s folder.",
    detail: "Pick another folder, or give Clipr access to this one.",
  });
  assert.deepEqual(failureActions("drivegone", 1), ["changeFolder"]);
  assert.deepEqual(failureActions("norights", 1), ["changeFolder", "showFolder"]);
  assert.deepEqual(failureActions("norights", 2), ["changeFolder", "showFolder", "copyDetails"], "Copy details joins only if it stays");
});

test("age-restricted and members-only rows", () => {
  assert.equal(classifyClipFailure("private_video", "This video is private or members-only and needs an account that can see it"), "private", "the engine's sentence names both, so the code decides");
  assert.equal(classifyClipFailure("members_only"), "members");
  assert.equal(classifyClipFailure("private_video", "This video is private"), "private");
  assert.equal(classifyClipFailure("bot_check"), "signin");
  assert.deepEqual(failureCopy("age", 1), {
    reason: "YouTube only shows this video to signed-in adults.",
    detail: "Sign in once and it tries again by itself. Your range is kept.",
  });
  assert.deepEqual(failureCopy("members", 1), { reason: "Only members of this channel can download it.", detail: "Your range is kept." });
  assert.deepEqual(failureActions("age", 1), ["signIn", "saveForLater"]);
  assert.deepEqual(failureActions("members", 1, false, true), ["showInBrowser", "saveForLater"]);
  assert.deepEqual(failureActions("members", 1, false, false), ["signIn", "showInBrowser", "saveForLater"], "no sign-in yet offers Sign in first");
});

test("a rejected saved sign-in gets its own row with Sign in", () => {
  assert.equal(classifyClipFailure("YOUTUBE_AUTH_REQUIRED", "YouTube serves higher formats to signed-in requests and the saved session expired"), "expired");
  assert.equal(classifyClipFailure("stale_session"), "expired");
  assert.deepEqual(failureCopy("expired", 1), { reason: "YouTube ended your sign-in.", detail: "Sign in again, then Retry. Your range is kept." });
  assert.deepEqual(failureActions("expired", 1), ["signIn", "retry"]);
});

test("C4-5: a path through a file says a folder cannot be made there, not that the drive is unplugged", () => {
  assert.equal(classifyClipFailure("folder_unusable"), "nofolder");
  assert.deepEqual(failureCopy("nofolder", 1, undefined, false, undefined, "Acme"), { reason: "Clipr can’t make Acme’s folder there.", detail: "A file is in the way. Pick another folder." });
  assert.deepEqual(failureActions("nofolder", 1), ["changeFolder"]);
});
