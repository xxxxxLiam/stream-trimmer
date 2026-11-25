/**
 * File: PlayerControls.test.ts
 * Path: src/renderer/src/features/player/components/PlayerControls.test.ts
 * Description: The transport row is three grid columns, not a centred absolute group that can sit on
 *   top of Speed in a narrow panel (read from source: no layout engine here). Space defers to a
 *   focused button in the key handler.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const row = readFileSync(new URL("./PlayerControls.tsx", import.meta.url), "utf8");
const keys = readFileSync(new URL("../hooks/usePreviewEffects.ts", import.meta.url), "utf8");

test("the middle group is a grid column, never absolutely centred over the side groups (F-15)", () => {
  assert.match(row, /grid-cols-\[1fr_auto_1fr\]/);
  assert.doesNotMatch(row, /absolute/);
});

test("Space is play/pause everywhere but fields, switches and menu choices (A-12)", () => {
  assert.match(keys, /spacePresses\(e\.target/);
});
