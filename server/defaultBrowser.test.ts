/**
 * File: defaultBrowser.test.ts
 * Path: server/defaultBrowser.test.ts
 * Description: Verifies default-browser mapping and preferred browser probe order.
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  mapBrowserName,
  browserCheckOrder,
}: {
  mapBrowserName: (value: string) => string | null;
  browserCheckOrder: (
    defaultBrowser: string | null,
    savedBrowser: string | null,
  ) => string[];
} = require("../electron/defaultBrowser.cjs");

test("maps common system browser names to yt-dlp names", () => {
  assert.equal(mapBrowserName("Google Chrome"), "chrome");
  assert.equal(mapBrowserName("Microsoft Edge"), "edge");
  assert.equal(mapBrowserName("org.mozilla.firefox.desktop"), "firefox");
  assert.equal(mapBrowserName("Arc"), null);
});

test("checks the default browser first and keeps every supported fallback", () => {
  const order = browserCheckOrder("firefox", "chrome");
  assert.deepEqual(order.slice(0, 2), ["firefox", "chrome"]);
  assert.equal(new Set(order).size, 6);
});

test("falls back safely when the system browser is unsupported", () => {
  const order = browserCheckOrder(null, "brave");
  assert.equal(order[0], "brave");
  assert.equal(order.length, 6);
});