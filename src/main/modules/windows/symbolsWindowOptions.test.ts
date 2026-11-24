/**
 * File: symbolsWindowOptions.test.ts
 * Path: src/main/modules/windows/symbolsWindowOptions.test.ts
 * Description: The Symbols window is small, frameless and always on top; only Esc closes it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { closesSymbols, symbolsUrl, symbolsWindowOptions } from "./symbolsWindowOptions";

test("about 396px wide, frameless, always on top, off the taskbar", () => {
  const o = symbolsWindowOptions();
  assert.equal(o.width, 396);
  assert.equal(o.frame, false);
  assert.equal(o.alwaysOnTop, true);
  assert.equal(o.skipTaskbar, true);
});

test("Esc closes it, other keys and key-ups do not", () => {
  assert.equal(closesSymbols({ type: "keyDown", key: "Escape" }), true);
  assert.equal(closesSymbols({ type: "keyUp", key: "Escape" }), false);
  assert.equal(closesSymbols({ type: "keyDown", key: "Enter" }), false);
});

test("the content loads from the local UI with the symbols query", () => {
  assert.equal(symbolsUrl("http://127.0.0.1:4000/"), "http://127.0.0.1:4000/?window=symbols");
});

test("it shows on every desktop and floats above full-screen apps, and only one is ever made", () => {
  const src = fs.readFileSync(new URL("./symbolsWindow.ts", import.meta.url), "utf8");
  assert.match(src, /setVisibleOnAllWorkspaces\(true, \{ visibleOnFullScreen: true \}\)/);
  assert.match(src, /if \(symbols && !symbols\.isDestroyed\(\)\)/);
});
