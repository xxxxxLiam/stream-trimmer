/**
 * File: ColdStartGlow.test.ts
 * Path: src/renderer/src/features/start/components/ColdStartGlow.test.ts
 * Description: The cold start's eased glow (Liam card A, 26 Nov): an 8-stop spotlight falling off to zero,
 *   sized 1100x760, a three-layer logo glow and a noise overlay.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const css = readFileSync(new URL("../../../styles.css", import.meta.url), "utf8");
const start = readFileSync(new URL("./ColdStart.tsx", import.meta.url), "utf8");

test("the spotlight is an 8-stop eased radial, not a 2-stop fade, peaking at Ice .15 and ending at 0", () => {
  const block = css.match(/--glow-spotlight:\s*radial-gradient\(([\s\S]*?)\);/)?.[1] ?? "";
  const stops = [...block.matchAll(/rgb\(var\(--ice-rgb\) \/ ([\d.]+)\) (\d+)%/g)];
  assert.deepEqual(stops.map((m) => Number(m[2])), [0, 12, 25, 40, 55, 70, 85, 100]);
  assert.equal(Number(stops[0][1]), 0.15);
  assert.equal(Number(stops[7][1]), 0);
  assert.match(start, /backgroundSize: "1100px 760px"/);
});

test("the logo glow is three drop-shadows and the window carries a 5% noise overlay", () => {
  assert.match(css, /--glow-mark: 0 0 8px/);
  assert.match(css, /--glow-mark-mid: 0 0 26px/);
  assert.match(css, /--glow-mark-far: 0 0 70px/);
  assert.match(start, /feTurbulence/);
  assert.match(start, /opacity: 0\.05/);
});
