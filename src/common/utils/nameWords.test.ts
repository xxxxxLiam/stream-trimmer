/**
 * File: nameWords.test.ts
 * Description: The shared word rule for clip names (C2-7). The engine's lane fallback and the
 *   renderer's saved name each assert the same title-to-name table next to their own code.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { twoWordName } from "./nameWords";

test("two different words, Title Case, stop words and bare numbers dropped", () => {
  assert.equal(twoWordName("Podcast #214, the long talk"), "Podcast Long");
  assert.equal(twoWordName("go go go", "gone"), "Go Gone");
  assert.equal(twoWordName(undefined), "");
});

test("one word, shouting and non-Latin titles", () => {
  assert.equal(twoWordName("THE GREATEST SPEECH EVER GIVEN"), "Greatest Speech");
  assert.equal(twoWordName("日本語 の タイトル"), "日本語 タイトル");
  assert.equal(twoWordName("214"), "");
});
