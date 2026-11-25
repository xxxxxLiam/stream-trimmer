/**
 * File: lengthRule.test.ts
 * Description: A campaign's length rule in words: fits, over, under, joined total, no rule; stored and read back.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { lengthVerdict, ruleOf } from "./lengthRule";
import { normalizeCampaigns } from "./campaigns";

const rule = { min: 30, max: 60 };

test("fits: the label names the range", () => {
  assert.deepEqual(lengthVerdict(42, rule, "Acme"), { state: "fits", label: "fits Acme’s 0:30 to 1:00" });
});

test("outside the range the label says by how much, never blocking", () => {
  assert.equal(lengthVerdict(74, rule, "Acme").label, "14 s over Acme’s 1:00");
  assert.equal(lengthVerdict(22, rule, "Acme").label, "8 s under Acme’s 0:30");
  assert.equal(lengthVerdict(74, rule, "Acme").state, "out");
});

test("no rule, or nothing marked yet: the label stays clip length", () => {
  assert.equal(lengthVerdict(42, null, "Acme").label, "clip length");
  assert.equal(lengthVerdict(0, rule, "Acme").label, "clip length");
  assert.equal(ruleOf({}), null);
  assert.equal(ruleOf(undefined), null);
});

test("one end alone works, and a reversed pair is read the right way round", () => {
  assert.equal(lengthVerdict(42, { max: 60 }, "Acme").label, "fits Acme’s up to 1:00");
  assert.deepEqual(ruleOf({ lengthMinSec: 60, lengthMaxSec: 30 }), { min: 30, max: 60 });
});

test("a stored rule survives loading and a junk one is dropped", () => {
  const raw = [{ id: "a", name: "Acme", lengthMinSec: 30, lengthMaxSec: 60 }, { id: "b", name: "Nova", lengthMinSec: -4, lengthMaxSec: "x" }];
  const [a, b] = normalizeCampaigns(raw);
  assert.deepEqual([a.lengthMinSec, a.lengthMaxSec], [30, 60]);
  assert.deepEqual([b.lengthMinSec, b.lengthMaxSec], [undefined, undefined]);
});

test("the export bar uses the joined total, keeps Ice only while it fits, and never goes red", () => {
  const bar = readFileSync(new URL("../../features/player/components/ExportBar.tsx", import.meta.url), "utf8");
  assert.match(bar, /lengthVerdict\(c\.totalSeconds/);
  assert.match(bar, /verdict\.state === "out" \? "text-fg" : "text-ice"/);
  assert.doesNotMatch(bar, /verdict[^\n]*text-error|text-error[^\n]*verdict/);
  assert.match(readFileSync(new URL("../../features/player/hooks/useTimelineController.ts", import.meta.url), "utf8"), /totalSeconds: total/);
});
