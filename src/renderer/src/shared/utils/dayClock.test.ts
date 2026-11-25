/**
 * File: dayClock.test.ts
 * Description: A-6: "today" rolls over at local midnight.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { dayKey, msUntilMidnight } from "./dayClock";
import { todayCount } from "./campaigns";

test("msUntilMidnight counts to the next local midnight", () => {
  const t = new Date(2026, 10, 25, 23, 59, 30).getTime();
  assert.equal(msUntilMidnight(t), 30_000);
  const noon = new Date(2026, 10, 25, 12, 0, 0).getTime();
  assert.equal(msUntilMidnight(noon), 12 * 3600_000);
});

test("A-6: the count reads 2 of 3 before midnight and 0 of 3 after", () => {
  const before = new Date(2026, 10, 25, 23, 59, 59).getTime();
  const after = new Date(2026, 10, 26, 0, 0, 1).getTime();
  assert.notEqual(dayKey(before), dayKey(after));
  const c: any = {
    id: "c", name: "C", dailyQuota: 3,
    usedRanges: { v: [{ clipId: "a", at: before - 1000 }, { clipId: "b", at: before - 500 }] },
  };
  assert.equal(todayCount(c, before), "2 of 3 today");
  assert.equal(todayCount(c, after), "0 of 3 today");
});
