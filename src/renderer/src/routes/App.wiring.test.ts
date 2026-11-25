/**
 * File: App.wiring.test.ts
 * Description: Pins the App.tsx wiring that the per-tab clip store (B-2, C-1) depends on.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const app = readFileSync(join(process.cwd(), "src", "renderer", "src", "routes", "App.tsx"), "utf8");

test("B-2: each tab's provider is told which tab it is", () => {
  assert.match(app, /<TabActiveProvider active=\{active\} tabId=\{tab\.id\}>/);
});

test("C-1: a cut clears ITS tab's store, never the module-level active one", () => {
  assert.ok(!/import \{[^}]*\bclearSegments\b[^}]*\} from "\.\/hooks\/useSegmentsState"/.test(app));
  assert.match(app, /clear: clearSegments\s*\} = useSegmentsState\(\)/);
});

test("F-1: one top bar and one tips host, for the open video only", () => {
  assert.match(app, /useTipsController\(!!info && active\)/);
  assert.match(app, /\{active && \(\s*<TopBar/);
  assert.match(app, /\{active && \(\s*<BottomBar/);
  assert.equal((app.match(/<TopBar/g) ?? []).length, 1);
});
