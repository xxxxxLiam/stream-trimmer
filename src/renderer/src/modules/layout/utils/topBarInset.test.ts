/**
 * File: topBarInset.test.ts
 * Description: The top bar leaves room for the macOS traffic lights (left) or the Windows window buttons
 *   (right), gives it back in full screen, and drags the window only when it is the title bar; controls stay clickable.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import {
  TOP_BAR_PAD,
  TOP_BAR_PAD_RIGHT,
  TOP_BAR_PAD_WITH_LIGHTS,
  WINDOWS_OVERLAY_WIDTH,
  barIsTitleBar,
  lightsShowing,
  topBarPaddingLeft,
  topBarPaddingRight,
} from "./topBarInset";

const mac = { macInset: true, winOverlay: false, fullScreen: false };
const win = { macInset: false, winOverlay: true, fullScreen: false };
const linux = { macInset: false, winOverlay: false, fullScreen: false };

test("macOS: room for the lights on the left, the plain margin in full screen, nothing on the right", () => {
  assert.equal(topBarPaddingLeft(mac), TOP_BAR_PAD_WITH_LIGHTS);
  assert.equal(topBarPaddingLeft({ ...mac, fullScreen: true }), TOP_BAR_PAD);
  assert.equal(topBarPaddingRight(mac), TOP_BAR_PAD_RIGHT);
  assert.equal(lightsShowing(mac), true);
  assert.ok(TOP_BAR_PAD_WITH_LIGHTS > 17 + 12 * 3 + 16, "the chip clears three 12px dots");
});

test("Windows: the chip starts 16px in, the icons stop short of the window buttons, full screen gives it back", () => {
  assert.equal(topBarPaddingLeft(win), TOP_BAR_PAD);
  assert.equal(topBarPaddingRight(win), WINDOWS_OVERLAY_WIDTH + TOP_BAR_PAD_RIGHT);
  assert.equal(topBarPaddingRight({ ...win, fullScreen: true }), TOP_BAR_PAD_RIGHT);
});

test("Linux keeps the plain bar and does not drag the window", () => {
  assert.equal(topBarPaddingLeft(linux), TOP_BAR_PAD);
  assert.equal(topBarPaddingRight(linux), TOP_BAR_PAD_RIGHT);
  assert.equal(barIsTitleBar(linux), false);
  assert.equal(barIsTitleBar(mac), true);
  assert.equal(barIsTitleBar(win), true);
});

const root = join(process.cwd(), "src", "renderer", "src");
const read = (f: string) => readFileSync(join(root, f), "utf8");

test("the bar drags only when it is the title bar, and buttons and menus inside it do not", () => {
  const bar = read("modules/layout/components/TopBar.tsx");
  assert.match(bar, /barIsTitleBar\(chrome\) \? "topbar-drag" : ""/);
  const css = read("styles.css");
  assert.match(css, /\.topbar-drag \{\s*-webkit-app-region: drag;/);
  assert.match(css, /\.topbar-drag :is\(button[^)]*\[role="menu"\][^)]*\) \{\s*-webkit-app-region: no-drag;/);
});
