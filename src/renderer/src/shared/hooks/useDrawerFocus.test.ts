/**
 * File: useDrawerFocus.test.ts
 * Description: F-4 and F-12 — Tab stays inside an open drawer, focus returns to the opener on close and
 *   lands on the heading when the view changes. The wrap rule is pure; the wiring is read from source.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { wrapTarget } from "./useDrawerFocus";

const els = (n: number) => Array.from({ length: n }, (_, i) => ({ i }) as unknown as HTMLElement);
const read = (f: string) => readFileSync(join(process.cwd(), "src/renderer/src", f), "utf8");

test("F-12: Tab on the last control wraps to the first, Shift+Tab on the first wraps to the last", () => {
  const [a, b, c] = els(3);
  assert.equal(wrapTarget([a, b, c], c, false), a);
  assert.equal(wrapTarget([a, b, c], a, true), c);
  assert.equal(wrapTarget([a, b, c], b, false), null, "the browser's own move stays inside");
  assert.equal(wrapTarget([a, b, c], b, true), null);
});

test("F-12: focus that is outside the drawer (the covered page) is pulled back in", () => {
  const [a, b] = els(2);
  const outside = {} as Element;
  assert.equal(wrapTarget([a, b], outside, false), a);
  assert.equal(wrapTarget([a, b], outside, true), b);
  assert.equal(wrapTarget([a, b], null, false), a);
  assert.equal(wrapTarget([], null, false), null);
});

test("F-4 and F-12: Help uses the shared focus hook and the Help button is the fallback opener", () => {
  const d = read("features/help/components/HelpDrawer.tsx");
  assert.match(d, /useDrawerFocus\(root, open,/);
  assert.match(d, /"#ui-help-button"/);
  assert.match(d, /ref=\{root\} onKeyDown=\{onKeyDown\}/);
  const h = read("shared/hooks/useDrawerFocus.ts");
  assert.match(h, /document\.addEventListener\("focusin"/);
  assert.match(h, /h\.focus\(\)/);
});

test("F-12: the Help search, the video search and the report box have a Frost focus ring", () => {
  for (const f of ["features/help/components/HelpTop.tsx", "features/help/components/HelpReport.tsx"]) {
    assert.match(read(f), /outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-frost/, f);
  }
  assert.match(read("shared/components/SearchPill.tsx"), /has-\[:focus-visible\]:outline-frost/);
});
