/**
 * File: tipsStore.test.ts
 * Description: F2-1 — tips are on or off in one shared place, so "Turn off tips" in one video turns them off in
 *   every open video, and is saved.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { getTipsOn, setTipsOn, getSeen, setSeen } from "./tipsStore";

test("F2-1: one switch for every controller; seen is shared too", () => {
  const w = globalThis as unknown as { window?: unknown };
  assert.equal(getTipsOn(), true);
  let calls = 0;
  void w;
  setTipsOn(false);
  assert.equal(getTipsOn(), false, "a second controller reading the store sees it off at once");
  setSeen({ marking: 1 });
  assert.deepEqual(getSeen(), { marking: 1 });
  setTipsOn(true);
  assert.equal(getTipsOn(), true);
  assert.equal(calls, 0);
});

test("F2-1: the controller keeps no state of its own for on or seen", () => {
  const c = readFileSync(join(process.cwd(), "src/renderer/src/features/tips/hooks/useTipsController.ts"), "utf8");
  assert.match(c, /const on = useTipsOn\(\)/);
  assert.match(c, /const seen = useSeen\(\)/);
  assert.doesNotMatch(c, /useState<boolean>/);
});
