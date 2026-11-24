/**
 * File: scrollbars.test.ts
 * Path: src/renderer/src/shared/utils/scrollbars.test.ts
 * Description: No visible scrollbar anywhere, and the rule is stated once (CLAUDE.md design rule).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../../styles.css", import.meta.url), "utf8");

test("no visible scrollbar is introduced, and the rule is stated once", () => {
  assert.match(css, /::-webkit-scrollbar\s*\{\s*width:\s*0;\s*height:\s*0;?\s*\}/);
  assert.equal((css.match(/::-webkit-scrollbar\s*\{/g) ?? []).length, 1);
});
