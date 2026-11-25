/**
 * File: fcpLookRichText.test.ts
 * Path: src/common/utils/fcpLookRichText.test.ts
 * Description: The Final Cut look reads the same from a plain XML export and
 *   from the rich-text copy TextEdit saves by default.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { parseLook, plainTextOf } from "./fcpLook";

const xml = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<fcpxml version="1.15">',
  "  <resources>",
  '    <effect id="r9" name="Color Wheels" uid="FxPlug:AAA"/>',
  "  </resources>",
  "  <library><event><project><sequence><spine>",
  '    <asset-clip ref="r2" name="Clip" duration="10s">',
  '      <adjust-transform scale="3.5 3.5"/>',
  '      <filter-video ref="r9" name="Color Wheels"/>',
  "    </asset-clip>",
  "  </spine></sequence></project></event></library>",
  "</fcpxml>",
].join("\n");

const rtf =
  "{\\rtf1\\ansi\\ansicpg1252\\cocoartf2908\n{\\fonttbl\\f0\\fswiss Helvetica;}\n\\pard\\tx720\n\n\\f0\\fs24 \\cf0 " +
  xml.split("\n").join("\\\n") +
  "}";

test("plain XML passes through untouched", () => {
  assert.equal(plainTextOf(xml), xml);
});

test("a rich-text copy gives back the exact XML", () => {
  assert.equal(plainTextOf(rtf), xml);
});

test("a rich-text copy reads the same look as the plain file", () => {
  const plain = parseLook(xml);
  const rich = parseLook(rtf);
  assert.deepEqual(rich, plain);
  assert.ok(!rich.clip.includes("\\"));
  assert.ok(!rich.clip.includes("}"));
  assert.deepEqual(rich.found, ["Scale 350%", "Color Wheels"]);
});

test("rich-text escapes for braces, backslashes and accents are undone", () => {
  const out = plainTextOf("{\\rtf1 <a b=\"\\{x\\}\\\\y\\'e9\"/>}");
  assert.equal(out, '<a b="{x}\\yé"/>');
});
