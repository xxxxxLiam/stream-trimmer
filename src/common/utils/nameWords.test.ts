/**
 * File: nameWords.test.ts
 * Description: One rule names a clip from a title in both processes (C2-7): the engine's fallback in the
 *   lane and the renderer's saved name are the same words.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { suggestClipName } from "../../main/features/engine/services/clipNames/clipNames";
import { suggestProjectName } from "../../renderer/src/features/clips/utils/projectName";
import { twoWordName } from "./nameWords";

const TITLES = ["Podcast #214, the long talk", "How I Made $10k in 30 days", "THE GREATEST SPEECH EVER GIVEN", "日本語 の タイトル", "214"];

test("the lane's fallback is the name the file gets, for every kind of title", () => {
  for (const title of TITLES) {
    const lane = suggestClipName({ table: null, lines: [], ranges: [{ start: 0, end: 5 }], videoTitle: title });
    const file = suggestProjectName({ label: title }) || "Clip";
    assert.equal(lane, file, title);
    assert.ok(lane.split(" ").length <= 2, `${title}: two words at most`);
  }
});

test("two different words, Title Case, stop words and bare numbers dropped", () => {
  assert.equal(twoWordName("Podcast #214, the long talk"), "Podcast Long");
  assert.equal(twoWordName("go go go", "gone"), "Go Gone");
  assert.equal(twoWordName(undefined), "");
});
