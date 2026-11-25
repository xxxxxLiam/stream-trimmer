/**
 * File: usePreviewEffects.test.ts
 * Path: src/renderer/src/features/player/hooks/usePreviewEffects.test.ts
 * Description: The key listener is added once per video, so I and O must read the latest handlers
 *   (the playhead now), never the ones from the render that added it. No DOM here, so this reads the source.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const src = fs.readFileSync(new URL("./usePreviewEffects.ts", import.meta.url), "utf8");

test("the key listener reads the latest handlers through a ref", () => {
  assert.match(src, /argsRef\.current\.setIn\(\)/);
  assert.match(src, /argsRef\.current\.setOut\(\)/);
  assert.doesNotMatch(src, /[^.]\ba\.setIn\(\)/);
  assert.doesNotMatch(src, /[^.]\ba\.setOut\(\)/);
});

test("a held J or L shuttle also stops when the window loses focus or is hidden, not only on keyup", () => {
  assert.match(src, /window\.addEventListener\("blur", stopShuttle\)/);
  assert.match(src, /document\.addEventListener\("visibilitychange"/);
  assert.match(src, /window\.removeEventListener\("blur", stopShuttle\)/);
});

import { readFileSync as readEffectsSrc } from "node:fs";

test("the preview plays only a joined clip's sections: the step runs while playing, looping or not", () => {
  const src = readEffectsSrc(new URL("./usePreviewEffects.ts", import.meta.url), "utf8");
  assert.match(src, /if \(!player\.playing\) return;\s*const step = joinedStep\(sections, player\.currentTime, loop\);/);
  assert.match(src, /if \(!loop \|\| sections\.length >= 2\) return;/);
  assert.match(src, /player\.pause\(\);\s*player\.seekTo\(step\.at\);/);
});
