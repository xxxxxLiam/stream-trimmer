/**
 * File: MarkBar.cutRow.test.ts
 * Path: src/components/MarkBar.cutRow.test.ts
 * Description: Cut is the primary action and must not scroll out of reach at the default
 * window. It lives in a row that is sticky to the bottom of the scrolling column. (The
 * measured proof is in audit/run-1/fixes/T10.md; this pins the structure so it cannot
 * quietly regress.) Source-level because the repo has no DOM test environment.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync(new URL("./MarkBar.tsx", import.meta.url), "utf8");

test("the Cut button sits inside a row that sticks in the three-column layout", () => {
  const rowStart = src.indexOf('id="ui-cut-row"');
  assert.ok(rowStart > 0, "ui-cut-row exists");
  const openTag = src.slice(src.lastIndexOf("<div", rowStart), src.indexOf(">", rowStart));
  assert.match(openTag, /\bcut-row\b/);
  assert.match(openTag, /bg-\[var\(--c-panel\)\]/, "needs an opaque panel background or content shows through");
  const cutAt = src.indexOf('id="ui-cut"');
  assert.ok(cutAt > rowStart, "Cut is after the row opens");
  // Nothing but the row's own content between the row and the button: the row closes after Cut.
  const afterCut = src.slice(cutAt);
  assert.ok(afterCut.indexOf("</button>") < afterCut.indexOf("</div>"), "Cut is inside the row");
});

test("the cut-row class is sticky to the bottom in the three-column layout only", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  const at = css.lastIndexOf("@container (min-width: 960px) {");
  assert.ok(at > 0);
  const block = css.slice(at, css.indexOf("\n}\n", at));
  assert.match(block, /\.cut-row\s*\{\s*position:\s*sticky;\s*bottom:\s*0;\s*\}/);
  // And not outside it: a stuck row would cover In and Add at the 900x600 minimum.
  assert.doesNotMatch(css.slice(0, at), /\.cut-row\s*\{/);
});

test("no visible scrollbar is introduced by the sticky row", () => {
  const css = readFileSync(new URL("../styles.css", import.meta.url), "utf8");
  assert.match(css, /::-webkit-scrollbar\s*\{\s*width:\s*0;\s*height:\s*0;?\s*\}/);
});
