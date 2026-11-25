/**
 * File: clipRowState.test.ts
 * Path: src/common/types/clipRowState.test.ts
 * Description: Pins the mapping from a classified failure to the Export row's state.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { rowStateFor } from "./clipRowState";

const engine = { code: "engine_behind", cause: "YouTube stopped the download.", error: "x" };

test("a tool failure on the first try is failed and retrying", () => {
  assert.deepEqual(rowStateFor(engine, { retrying: true }), { state: "failed", reason: "YouTube stopped the download.", retrying: true });
});

test("the same failure after the retry is final", () => {
  assert.deepEqual(rowStateFor(engine, { retried: true }), { state: "failed-final", reason: "YouTube stopped the download." });
});

test("disk full and private videos never become a retry or a final failure", () => {
  assert.equal(rowStateFor({ code: "disk_full", error: "full" }, { retrying: true }).state, "no-space");
  assert.deepEqual(rowStateFor({ code: "private_video", error: "p" }, { retried: true }), { state: "cannot-download", kind: "private", reason: "p" });
});

test("E2-1: a failure that is not a running tool update is final, so the row never promises an update", () => {
  for (const code of ["video_removed", "bot_check", "access_refused", "rate_limited", "format_unavailable", "tools_missing", "unknown", "engine_behind"]) {
    const row = rowStateFor({ code, cause: "Plain sentence.", error: "x" });
    assert.equal(row.state, "failed-final", code);
  }
  assert.equal(rowStateFor(engine, { retrying: true }).state, "failed");
});

test("E2-1: yt-dlp's own text never becomes the row's reason", () => {
  const row = rowStateFor({ code: "unknown", cause: "Traceback (most recent call last): File /Users/jane/x.py", error: "x", rawCause: true });
  assert.deepEqual(row, { state: "failed-final", reason: "YouTube stopped the download." });
});
