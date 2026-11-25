/**
 * File: dialogOpen.test.ts
 * Description: Shortcut keys check whether a drawer or dialog is open.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { dialogOpen } from "./dialogOpen";

test("V18-T-12: a dialog or drawer in the page counts as open", () => {
  const seen: string[] = [];
  const root = { querySelector: (q: string) => (seen.push(q), seen.length === 1 ? {} : null) };
  assert.equal(dialogOpen(root as never), true);
  assert.equal(dialogOpen(root as never), false);
  assert.match(seen[0], /role="dialog"/);
  assert.match(seen[0], /aria-modal="true"/);
});

test("A4-1: the first-use Tip card does not count, so the Clip shortcut it asks for works", () => {
  let asked = "";
  dialogOpen({ querySelector: (q: string) => ((asked = q), null) } as never);
  assert.match(asked, /\[role="dialog"\]:not\(\[data-nonblocking\]\)/);
  const tip = readFileSync(new URL("../../features/tips/components/TipCard.tsx", import.meta.url), "utf8");
  assert.match(tip, /role="dialog"\s+data-nonblocking=""/);
});
