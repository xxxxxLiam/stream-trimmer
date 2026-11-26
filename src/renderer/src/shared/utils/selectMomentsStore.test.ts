import assert from "node:assert/strict";
import test from "node:test";
import { enterSelectMoments, exitSelectMoments, getSelectMoments, selectAllMoments, toggleMoment } from "./selectMomentsStore";

test("Select moments: tick, untick, select all, and leaving forgets the ticks", () => {
  enterSelectMoments();
  toggleMoment("a");
  toggleMoment("b");
  toggleMoment("a");
  assert.deepEqual([...getSelectMoments().ids], ["b"]);
  selectAllMoments(["a", "b", "c"]);
  assert.equal(getSelectMoments().ids.size, 3);
  exitSelectMoments();
  assert.equal(getSelectMoments().on, false);
  assert.equal(getSelectMoments().ids.size, 0);
});
