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
