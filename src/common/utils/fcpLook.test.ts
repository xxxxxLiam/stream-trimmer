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

test("a connected clip on the look clip is left behind, and the look after it is still read (D-6)", () => {
  const look = parseLook(
    sampleExport({
      clipChildren:
        '<adjust-transform scale="1.2 1.2"/><asset-clip ref="r2" lane="1" name="Broll"><adjust-volume amount="-96dB"/></asset-clip><adjust-volume amount="-3dB"/>',
    }),
  );
  assert.doesNotMatch(look.clip, /asset-clip|Broll/);
  assert.match(look.clip, /adjust-transform/);
  assert.match(look.clip, /amount="-3dB"/);
  assert.doesNotMatch(look.clip, /-96dB/);
  assert.deepEqual(look.found, ["Scale 120%", "Volume"]);
});

test("a title on the look clip is left behind and its effect is not carried (D-6)", () => {
  const look = parseLook(
    sampleExport({
      clipChildren: '<adjust-transform scale="1.2 1.2"/><title ref="r6" lane="1" name="T"><text><text-style ref="ts1">Hi</text-style></text></title>',
      effects: '    <effect id="r6" name="Basic Title" uid="x"/>',
    }),
  );
  assert.doesNotMatch(look.clip, /title/);
  assert.deepEqual(look.effects, []);
});

test("a clip that only holds connected items has no look to read (D-6)", () => {
  assert.throws(
    () => parseLook(sampleExport({ clipChildren: '<asset-clip ref="r2" lane="1" name="Broll"/><note>x</note><marker start="0s" duration="1/30s" value="m"/>' })),
    /has no look on it/,
  );
});

test("an export whose tags do not balance is refused in plain words", () => {
  assert.throws(() => parseLook(sampleExport().replace("</spine>", "")), /does not look like a Final Cut XML export/);
});

test("a flipped clip still reads its scale (D-15)", () => {
  assert.deepEqual(parseLook(sampleExport({ clipChildren: '<adjust-transform scale="-1.2 1.2"/>' })).found, ["Scale 120%"]);
});

test("an effect used by a filter inside an audio channel source is carried", () => {
  const look = parseLook(
    sampleExport({
      clipChildren: '<audio-channel-source srcCh="1, 2"><filter-audio ref="r3" name="EQ"/></audio-channel-source>',
    }),
  );
  assert.equal(look.effects.length, 1);
  assert.match(look.clip, /ref="fx1"/);
});

test("the look's own frame size and rate are read from its sequence format", () => {
  assert.deepEqual(parseLook(sampleExport()).format, { width: 1920, height: 1080, fps: "29.97" });
});

test("rates are plain text: whole, NTSC and odd ones", async () => {
  const { fpsText } = await import("./fcpLook");
  assert.equal(fpsText("1/25s"), "25");
  assert.equal(fpsText("1/30s"), "30");
  assert.equal(fpsText("1001/24000s"), "23.976");
  assert.equal(fpsText("1001/60000s"), "59.94");
  assert.equal(fpsText("1/48s"), "48");
  assert.equal(fpsText("0/30s"), null);
  assert.equal(fpsText(undefined), null);
});

test("an export that names no usable format has a look without one", () => {
  const noFormat = sampleExport().replace(/<format [^>]*\/>/, "");
  assert.equal(parseLook(noFormat).format, undefined);
  assert.ok(parseLook(noFormat).found.length > 0, "the look itself still reads");
});
