/**
 * File: inOutFields.test.ts
 * Path: src/renderer/src/features/player/utils/inOutFields.test.ts
 * Description: What a typed or pasted In or Out becomes, and when the pair is the wrong way round.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { OUT_AFTER_IN, outBeforeIn, readTime } from "./inOutFields";

test("a typed or pasted time becomes the clipper's HH:MM:SS text, in any of the usual shapes", () => {
  assert.deepEqual(readTime("1:12:04", 8000), { kind: "set", text: "01:12:04" });
  assert.deepEqual(readTime(" 72:04 ", 8000), { kind: "set", text: "01:12:04" });
  assert.deepEqual(readTime("4324", 8000), { kind: "set", text: "01:12:04" });
  assert.deepEqual(readTime("01:12:04.9", 8000), { kind: "set", text: "01:12:04.9" }, "tenths are kept");
});

test("an empty field clears that end; nonsense and a time past the video's end get a sentence", () => {
  assert.deepEqual(readTime("  ", 8000), { kind: "clear" });
  assert.deepEqual(readTime("abc", 8000), { kind: "bad", message: "Type a time like 1:12:04" });
  assert.deepEqual(readTime("1:99:00", 8000), { kind: "bad", message: "Type a time like 1:12:04" });
  assert.deepEqual(readTime("3:00:00", 8000), { kind: "bad", message: "That is past the end of the video" });
  assert.equal(readTime("3:00:00", 0).kind, "set", "an unknown length cannot rule a time out");
});

test("Out must be after In: equal or earlier is flagged, an unset end is not", () => {
  assert.equal(outBeforeIn("01:12:46", "01:12:04"), true);
  assert.equal(outBeforeIn("01:12:04", "01:12:04"), true);
  assert.equal(outBeforeIn("01:12:04", "01:12:46"), false);
  assert.equal(outBeforeIn("01:12:04", ""), false);
  assert.equal(OUT_AFTER_IN, "Out must be after In");
});

test("the footer shows the fields in place of the read-only times, keeping their ids", () => {
  const bar = readFileSync(new URL("../components/ExportBar.tsx", import.meta.url), "utf8");
  assert.match(bar, /chips\.length === 0 \? \(\s*<InOutFields \/>/);
  assert.match(bar, /Type or paste a time/);
  const fields = readFileSync(new URL("../components/InOutFields.tsx", import.meta.url), "utf8");
  assert.match(fields, /id="ui-mark-in"/);
  assert.match(fields, /id="ui-mark-out"/);
  assert.match(fields, /onPaste=/);
  assert.match(fields, /border-error/);
});
