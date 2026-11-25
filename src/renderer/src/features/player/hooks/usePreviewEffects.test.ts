/**
 * File: usePreviewEffects.test.ts
 * Path: src/renderer/src/features/player/hooks/usePreviewEffects.test.ts
 * Description: The key listener is added once per video, so I and O must read the latest handlers
 *   (the playhead now), never the ones from the render that added it. No DOM here, so this reads the source.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const src = fs.readFileSync(path.join(__dirname, "usePreviewEffects.ts"), "utf8");

test("the key listener reads the latest handlers through a ref", () => {
  assert.match(src, /argsRef\.current\.setIn\(\)/);
  assert.match(src, /argsRef\.current\.setOut\(\)/);
  assert.doesNotMatch(src, /[^.]\ba\.setIn\(\)/);
  assert.doesNotMatch(src, /[^.]\ba\.setOut\(\)/);
});
