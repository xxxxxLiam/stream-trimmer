/**
 * File: windowChrome.test.ts
 * Description: macOS and Windows hide the native title bar so the app's top bar is the only one; Linux keeps the frame.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { TRAFFIC_LIGHTS, WINDOWS_OVERLAY, titleBarOptions, windowChrome } from "./windowChrome";

test("macOS gets a hidden title bar with the traffic lights in the top bar", () => {
  const o = titleBarOptions("darwin");
  assert.equal(o.titleBarStyle, "hidden");
  assert.deepEqual(o.trafficLightPosition, TRAFFIC_LIGHTS);
  assert.equal(o.titleBarOverlay, undefined);
  // 12px dots centred in the 53px bar, at the bar's left margin
  assert.equal(TRAFFIC_LIGHTS.x, 17);
  assert.equal(TRAFFIC_LIGHTS.y, Math.round((53 - 12) / 2));
});

test("Windows gets a hidden title bar with the system buttons over the bar, in the app's colours", () => {
  const o = titleBarOptions("win32");
  assert.equal(o.titleBarStyle, "hidden");
  assert.deepEqual(o.titleBarOverlay, WINDOWS_OVERLAY);
  assert.equal(o.trafficLightPosition, undefined);
  assert.equal(WINDOWS_OVERLAY.color, "#0A0D0F", "the bg token");
  assert.equal(WINDOWS_OVERLAY.symbolColor, "#F2F5F6", "the fg token");
  assert.ok(WINDOWS_OVERLAY.height >= 48 && WINDOWS_OVERLAY.height <= 53, "the bar's height");
});

test("Linux keeps the native frame: no title bar options at all", () => {
  assert.deepEqual(titleBarOptions("linux"), {});
  assert.deepEqual(titleBarOptions("freebsd"), {});
});

test("the page is told which frame it has, and full screen only counts where the bar is the title bar", () => {
  assert.deepEqual(windowChrome("darwin", false), { macInset: true, winOverlay: false, fullScreen: false });
  assert.deepEqual(windowChrome("darwin", true), { macInset: true, winOverlay: false, fullScreen: true });
  assert.deepEqual(windowChrome("win32", true), { macInset: false, winOverlay: true, fullScreen: true });
  assert.deepEqual(windowChrome("linux", true), { macInset: false, winOverlay: false, fullScreen: false });
});
