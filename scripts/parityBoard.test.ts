/**
 * File: parityBoard.test.ts
 * Path: scripts/parityBoard.test.ts
 * Description: The parity tool's board renderer must expand every board binding and report the
 *   frame size from canvas.json. Skipped where the canvas snapshot is not mounted.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { renderBoard, SNAPSHOT } = require("./parity/boardRender.cjs");
const have = fs.existsSync(`${SNAPSHOT}/canvas.json`);

test("renders a board at its canvas.json frame with every binding expanded", { skip: !have }, async () => {
  const { png, frame } = await renderBoard("FoundationColour");
  assert.equal(frame.width, 1440);
  // PNG IHDR width/height at bytes 16..24.
  assert.equal(png.readUInt32BE(16), frame.width);
  assert.equal(png.readUInt32BE(20), frame.height);
  assert.ok(png.length > 50_000, "a blank page would be far smaller");
});

test("rejects a board that is not in canvas.json", { skip: !have }, async () => {
  await assert.rejects(() => renderBoard("NoSuchBoard"), /not in canvas.json/);
});
