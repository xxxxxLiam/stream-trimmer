/**
 * File: ClipNameField.test.tsx
 * Path: src/renderer/src/features/player/components/ClipNameField.test.tsx
 * Description: The clip's name on the Clips lane is a focusable button that says how to rename it, and
 *   the component wires double-click, Enter, Esc and the naming rule (read from source: no DOM here).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import ClipNameField from "./ClipNameField";

const src = readFileSync(new URL("./ClipNameField.tsx", import.meta.url), "utf8");
const clip = readFileSync(new URL("./ClipButton.tsx", import.meta.url), "utf8");
const lane = readFileSync(new URL("./ClipsLane.tsx", import.meta.url), "utf8");

test("the name on the lane is a button that can be renamed, not a plain span", () => {
  const h = renderToStaticMarkup(<ClipNameField name="Honest Version" onRename={() => {}} className="x" style={{}} />);
  assert.match(h, /^<button/);
  assert.match(h, /Honest Version, rename/);
  assert.match(lane, /<ClipNameField/);
});

test("double-click or Enter edits, Esc cancels, the naming rule's error sits under the field", () => {
  assert.match(src, /onDoubleClick=\{start\}/);
  assert.match(src, /e\.key === "Enter"/);
  assert.match(src, /renameKey\(e\.key\)/);
  assert.match(src, /role="alert"/);
});

test("the typed name is the one published as the next clip's name", () => {
  assert.match(lane, /typed\.name/);
  assert.match(lane, /setNextClipName\(nextName\)/);
});

test("Clip menu keyboard: focus moves in on open, arrows move, Esc closes and returns to the arrow (C-11)", () => {
  assert.match(clip, /\.focus\(\)/);
  assert.match(clip, /menuTarget\(/);
  assert.match(clip, /e\.key === "Escape"[\s\S]*c\.closeMenu\(\)[\s\S]*arrowRef\.current\?\.focus\(\)/);
  assert.match(clip, /menuRef=\{arrowRef\}/);
});
