/**
 * File: doneUndoStore.test.ts
 * Path: src/renderer/src/features/workspace/utils/doneUndoStore.test.ts
 * Description: B2-4 — the Undo line for a video moved to Done outlives the panel that showed it.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createDoneUndoStore } from "./doneUndoStore";

test("B2-4: the Undo line is held by the store, so a remounted panel still shows it, until it times out", () => {
  const jobs: Array<() => void> = [];
  const store = createDoneUndoStore(8000, (fn) => jobs.push(fn), () => {});
  store.show({ id: "a", title: "Launch recap" });
  // A second reader (the remounted panel) sees the same line.
  assert.deepEqual({ ...store.get(), at: 0 }, { id: "a", title: "Launch recap", kind: "done", at: 0 });
  jobs[0]();
  assert.equal(store.get(), null);
});

test("B2-4: clearing (Undo pressed) removes the line at once", () => {
  const store = createDoneUndoStore(8000, () => 1, () => {});
  store.show({ id: "a", title: "x" });
  store.clear();
  assert.equal(store.get(), null);
});

test("List rows: a removed video's line is tagged so Undo brings the tab back, and carries its start for the ring", () => {
  const store = createDoneUndoStore(8000, () => 1, () => {});
  const before = Date.now();
  store.show({ id: "a", title: "x", kind: "removed" });
  assert.equal(store.get()?.kind, "removed");
  assert.ok((store.get()?.at ?? 0) >= before);
});
