/**
 * File: settingsStore.test.ts
 * Path: server/settingsStore.test.ts
 * Description: Verifies saved settings survive a simulated app relaunch.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  createSettingsStore,
}: {
  createSettingsStore: (filePath: string) => {
    load: () => Record<string, unknown>;
    all: () => Record<string, unknown>;
    set: (key: string, value: unknown) => boolean;
    persist: () => boolean;
  };
} = require("../electron/settingsStore.cjs");

function tempFile(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipper-settings-"));
  return path.join(dir, "settings.json");
}

test("saved folders survive a relaunch", () => {
  const file = tempFile();

  const first = createSettingsStore(file);
  first.load();
  first.set("clipper.saveDirs", ["/Users/me/Clips", "/Users/me/Desktop"]);
  first.set("clipper.saveDir", "/Users/me/Clips");
  first.set("clipper.authSource", "app");

  // Relaunch: a brand-new store reading the same file.
  const second = createSettingsStore(file);
  const restored = second.load();
  assert.deepEqual(restored["clipper.saveDirs"], [
    "/Users/me/Clips",
    "/Users/me/Desktop",
  ]);
  assert.equal(restored["clipper.saveDir"], "/Users/me/Clips");
  assert.equal(restored["clipper.authSource"], "app");
});

test("a fresh store never blanks keys it has not loaded", () => {
  const file = tempFile();
  const first = createSettingsStore(file);
  first.load();
  first.set("clipper.saveDirs", ["/Users/me/Clips"]);

  // The startup-order bug: a store that writes before load() must not wipe
  // the keys already on disk.
  const racing = createSettingsStore(file);
  racing.set("clipper.cookieBrowser", "chrome");

  const after = createSettingsStore(file);
  const restored = after.load();
  assert.deepEqual(restored["clipper.saveDirs"], ["/Users/me/Clips"]);
  assert.equal(restored["clipper.cookieBrowser"], "chrome");
});

test("a removed key stays removed, and corrupt files do not throw", () => {
  const file = tempFile();
  const store = createSettingsStore(file);
  store.load();
  store.set("clipper.saveDir", "/tmp/a");
  store.set("clipper.saveDir", null);
  assert.equal(createSettingsStore(file).load()["clipper.saveDir"], undefined);

  fs.writeFileSync(file, "{ not json");
  assert.deepEqual(createSettingsStore(file).load(), {});
});
