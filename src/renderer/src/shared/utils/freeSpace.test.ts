import assert from "node:assert/strict";
import test from "node:test";
import { formatMb, roomDetail, roomProblem } from "./freeSpace";

test("Free space: only a clear, measured shortfall is a problem", () => {
  assert.deepEqual(roomProblem({ ok: false, neededMb: 180, freeMb: 60 }), { neededMb: 180, freeMb: 60 });
  assert.equal(roomProblem({ ok: true, neededMb: 180, freeMb: 5000 }), null);
  assert.equal(roomProblem({ ok: false, neededMb: 180, freeMb: null }), null, "no measurement: never blocks a clip");
  assert.equal(roomProblem(undefined), null);
  assert.equal(roomProblem(null), null);
});

test("Free space: the row says it as drawn", () => {
  assert.equal(roomDetail({ neededMb: 183, freeMb: 60 }), "It needs about 180 MB and 60 MB is free. It waits here until it has somewhere to go.");
  assert.equal(formatMb(1536), "1.5 GB");
  assert.equal(formatMb(4, true), "10 MB");
});
