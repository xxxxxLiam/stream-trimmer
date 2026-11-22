/**
 * File: DownloadsPanel.label.test.ts
 * Description: Item 11 — the button must not call finished work "partials". Source-level: the
 * label, and the sentence that says what Clear leaves alone.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./DownloadsPanel.tsx", import.meta.url), "utf8");

test("the clear button says unfinished and the note says what is left alone", () => {
  assert.match(src, /Clear unfinished/);
  assert.doesNotMatch(src, /Clear partials/);
  assert.match(src, /clips waiting to be saved/);
});
