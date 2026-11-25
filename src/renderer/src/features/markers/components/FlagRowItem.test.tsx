/**
 * File: FlagRowItem.test.tsx
 * Description: B-9 — a flag row can be removed: a "Remove flag" button, and Delete or Backspace on the row.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import FlagRowItem from "./FlagRowItem";
import { isRemoveKey } from "../utils/markers";

test("B-9: each flag row has a Remove flag button next to its open button", () => {
  const html = renderToStaticMarkup(
    <FlagRowItem row={{ at: 4462, words: "nobody talks about pricing", range: null }} onOpen={() => {}} onRemove={() => {}} />,
  );
  assert.match(html, /aria-label="Remove flag"/);
  assert.match(html, /aria-label="Flag at 1:14:22: nobody talks about pricing"/);
});

test("B-9: Delete and Backspace remove the focused row; other keys do not", () => {
  assert.equal(isRemoveKey("Delete"), true);
  assert.equal(isRemoveKey("Backspace"), true);
  assert.equal(isRemoveKey("Enter"), false);
  assert.equal(isRemoveKey("n"), false);
});
