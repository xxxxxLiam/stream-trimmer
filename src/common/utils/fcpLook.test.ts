/**
 * File: fcpLook.test.ts
 * Path: src/common/utils/fcpLook.test.ts
 * Description: What parseLook keeps from a Final Cut export, and its plain-word errors.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseLook } from "./fcpLook";
import { LOUDNESS_CHILD, TYPICAL_CHILDREN, sampleExport } from "./fcpLook.fixture";

test("keeps scale, colour effect and volume, renames the effect, and says what it found in words", () => {
  const look = parseLook(sampleExport());
  assert.equal(look.version, "1.13");
  assert.deepEqual(look.found, ["Scale 120%", "Color Board", "Volume"]);
  assert.equal(look.effects.length, 1);
  assert.match(look.effects[0], /id="fx1"/);
  assert.match(look.clip, /ref="fx1"/);
  assert.doesNotMatch(look.clip, /ref="r3"/);
});

test("the export version is carried through for every version Final Cut writes today", () => {
  for (const v of ["1.10", "1.11", "1.12", "1.13"]) assert.equal(parseLook(sampleExport({ version: v })).version, v);
});

test("plain-word errors: empty, not XML, no clip, clip with no look", () => {
  assert.throws(() => parseLook("   "), /empty/i);
  assert.throws(() => parseLook("just some words"), /does not look like a Final Cut XML export/);
  assert.throws(() => parseLook(sampleExport({ noClip: true })), /No video clip was found/);
  assert.throws(() => parseLook(sampleExport({ clipChildren: "" })), /has no look on it/);
});

test("an effect the clip uses but the export lacks is named, not guessed", () => {
  assert.throws(() => parseLook(sampleExport({ effects: "" })), /missing an effect/);
});

test("loudness is named when the clip has it", () => {
  assert.deepEqual(parseLook(sampleExport({ clipChildren: TYPICAL_CHILDREN + LOUDNESS_CHILD })).found, ["Scale 120%", "Color Board", "Volume", "Loudness"]);
});
