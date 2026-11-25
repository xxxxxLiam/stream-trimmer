/**
 * File: parityFrame.test.ts
 * Description: The parity script compares a board's window interior (inside its 1px border) with the
 *   app window; a drawn window cropped by the board must trim and map the same way on both sides.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { interiorOf } = require("./parity/parity.cjs");

test("a whole window loses its 1px border on every side, and the app rect is the interior", () => {
  const r = interiorOf({ width: 1360, height: 760, clip: { x: 0, y: 0, width: 1360, height: 760 } });
  assert.deepEqual(r.trim, { left: 1, top: 1, width: 1358, height: 758 });
  assert.deepEqual(r.app, { x: 0, y: 0, width: 1358, height: 758 });
});

test("a window cut off at the bottom trims only the edges that are in the picture", () => {
  const r = interiorOf({ width: 1360, height: 760, clip: { x: 0, y: 0, width: 1360, height: 500 } });
  assert.deepEqual(r.trim, { left: 1, top: 1, width: 1358, height: 499 });
  assert.deepEqual(r.app, { x: 0, y: 0, width: 1358, height: 499 });
});
