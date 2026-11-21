/**
 * File: SymbolPalette.layer.test.ts
 * Description: Item 7 — the Symbols palette must not sit over the help drawer. Same layering
 * as Copy blocks: z-20 (under the header's z-30 and the drawer) and shifted left of the drawer.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { clearanceFor, EDGE_GAP } from "./useDrawerClearance";

const read = (f: string) => readFileSync(new URL(f, import.meta.url), "utf8");

test("clearanceFor: nothing to dodge without a drawer, 400px + gap with one at the right edge", () => {
  assert.equal(clearanceFor(null, 1100), EDGE_GAP);
  assert.equal(clearanceFor({ left: 700, width: 400 }, 1100), 400 + EDGE_GAP);
  assert.equal(clearanceFor({ left: 0, width: 400 }, 900), EDGE_GAP, "stacked drawer is not at the edge");
});

test("SymbolPalette is z-20 and uses the shared drawer clearance, like CopyBlocks", () => {
  for (const f of ["./SymbolPalette.tsx", "./CopyBlocks.tsx"]) {
    const src = read(f);
    const panel = src.slice(src.indexOf('className="surface-panel fixed'));
    const classes = panel.slice(0, panel.indexOf("\n"));
    assert.match(classes, /\bz-20\b/, `${f} panel layer`);
    assert.doesNotMatch(classes, /\bz-50\b/, `${f} must not be z-50`);
    assert.match(src, /useDrawerClearance\(open\)/, `${f} clears the drawer`);
    assert.match(src, /style=\{\{ right \}\}/, `${f} applies it`);
  }
});
