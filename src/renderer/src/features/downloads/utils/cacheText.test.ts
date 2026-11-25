import assert from "node:assert/strict";
import test from "node:test";
import { cacheNote, formatBytes } from "./cacheText";

test("sizes read in KB, MB and GB", () => {
  assert.equal(formatBytes(10), "1 KB");
  assert.equal(formatBytes(5 * 1024 ** 2), "5 MB");
  assert.equal(formatBytes(1.5 * 1024 ** 3), "1.5 GB");
});

test("the note says unfinished and what is left alone", () => {
  assert.match(cacheNote(2048), /unfinished downloads/);
  assert.match(cacheNote(2048), /clips waiting to be saved/);
  assert.doesNotMatch(cacheNote(2048), /partials/);
});
