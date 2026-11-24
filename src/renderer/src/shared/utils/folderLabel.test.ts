/**
 * File: folderLabel.test.ts
 * Description: A folder path reads as its last two folders on chips and rows.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { folderChipLabel } from "./folderLabel";

test("last two folders, either slash, with a fallback", () => {
  assert.equal(folderChipLabel("/Users/a/Downloads/Clipr"), "Downloads/Clipr");
  assert.equal(folderChipLabel("C:\\Users\\a\\Downloads\\Clipr"), "Downloads/Clipr");
  assert.equal(folderChipLabel(""), "Downloads/Clipr");
  assert.equal(folderChipLabel("/Clips"), "Clips");
});
