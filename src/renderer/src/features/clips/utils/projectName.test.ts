/**
 * File: projectName.test.ts
 * Description: The saved name from a video title is what the engine suggests in the lane (C2-7): the
 *   same title-to-name table is asserted in the engine's clipNames.test.ts.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { suggestProjectName } from "./projectName";

const TITLE_NAMES: [string, string][] = [
  ["Podcast #214, the long talk", "Podcast Long"],
  ["How I Made $10k in 30 days", "How Made"],
  ["THE GREATEST SPEECH EVER GIVEN", "Greatest Speech"],
  ["日本語 の タイトル", "日本語 タイトル"],
  ["214", "Clip"],
];

test("the saved name for each kind of title is the name the lane suggested (C2-7)", () => {
  for (const [title, name] of TITLE_NAMES) {
    assert.equal(suggestProjectName({ label: title }) || "Clip", name, title);
  }
});

test("a label is used before the category, two words at most", () => {
  assert.equal(suggestProjectName({ label: "honest version of events", category: "Story" }), "Honest Version");
  assert.equal(suggestProjectName({ label: "", category: "Story time" }), "Story Time");
});
