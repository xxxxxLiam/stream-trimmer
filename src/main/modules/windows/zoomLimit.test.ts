/**
 * File: zoomLimit.test.ts
 * Description: F-13: zoom-in stops where the workspace would no longer fit.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { MIN_CSS_WIDTH, isZoomInChord, maxZoomFactor, zoomInBlocked, zoomLevelOf } from "./zoomLimit";

test("the zoom limit keeps the minimum css width at any window size", () => {
  assert.equal(maxZoomFactor(1160), 1160 / MIN_CSS_WIDTH);
  assert.ok(1160 / maxZoomFactor(1160) >= MIN_CSS_WIDTH - 1e-6);
  assert.equal(maxZoomFactor(600), 1, "never below 100%");
  assert.equal(maxZoomFactor(NaN), 1);
});

test("zoom-in is blocked at the limit and allowed below it", () => {
  assert.equal(zoomInBlocked(0, 1160), false);
  const limit = zoomLevelOf(maxZoomFactor(1160));
  assert.equal(zoomInBlocked(limit - 0.6, 1160), false);
  assert.equal(zoomInBlocked(limit - 0.4, 1160), true);
  assert.equal(zoomInBlocked(3.5, 1160), true, "189% (level 3.5) is far past it");
});

test("zoom-in chords are Ctrl/Cmd with + or =", () => {
  assert.equal(isZoomInChord({ type: "keyDown", key: "=", control: true }), true);
  assert.equal(isZoomInChord({ type: "keyDown", key: "+", meta: true }), true);
  assert.equal(isZoomInChord({ type: "keyDown", key: "-", control: true }), false);
  assert.equal(isZoomInChord({ type: "keyDown", key: "=" }), false);
  assert.equal(isZoomInChord({ type: "keyUp", key: "=", control: true }), false);
});
