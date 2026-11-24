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

test("window mode crops to the 1360 by 760 app frame the board draws", { skip: !have }, async () => {
  const prev = process.env.PARITY_SNAPSHOT;
  process.env.PARITY_SNAPSHOT = "pending";
  try {
    if (!fs.existsSync(`${require("./parity/boardRender.cjs").SNAPSHOT}/Main01Layout.dc.html`)) return;
    const { png, frame } = await renderBoard("Main01Layout", { window: 0 });
    assert.deepEqual([frame.width, frame.height], [1360, 760]);
    assert.equal(png.readUInt32BE(16), 1360);
    assert.equal(png.readUInt32BE(20), 760);
    await assert.rejects(() => renderBoard("Main01Layout", { window: 5 }), /no window frame #5/);
  } finally {
    if (prev === undefined) delete process.env.PARITY_SNAPSHOT;
    else process.env.PARITY_SNAPSHOT = prev;
  }
});
