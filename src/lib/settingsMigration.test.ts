/**
 * File: settingsMigration.test.ts
 * Path: src/lib/settingsMigration.test.ts
 * Description: Pins the saveDir -> clipsDir/dataDir migration in electron/settingsStore.cjs.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createSettingsStore, migrateSettings } = require("../../electron/settingsStore.cjs");

test("saveDir becomes clipsDir and dataDir is proposed, unconfirmed", () => {
  const out = migrateSettings({ "clipper.saveDir": "/Users/me/Clips" });
  assert.equal(out["clipper.clipsDir"], "/Users/me/Clips");
  assert.equal(out["clipper.dataDir"], "/Users/me/channel-data");
  assert.equal(out["clipper.dataDirConfirmed"], false);
  // Old key stays for a downgrade.
  assert.equal(out["clipper.saveDir"], "/Users/me/Clips");
});

test("falls back to the first saved location when no active saveDir", () => {
  const out = migrateSettings({ "clipper.saveDirs": ["/a/one", "/a/two"] });
  assert.equal(out["clipper.clipsDir"], "/a/one");
});

test("never overwrites folders the user already chose", () => {
  const input = {
    "clipper.saveDir": "/old",
    "clipper.clipsDir": "/new/clips",
    "clipper.dataDir": "/new/data",
    "clipper.dataDirConfirmed": true,
  };
  assert.deepEqual(migrateSettings(input), input);
});

test("a fresh install gets nothing invented", () => {
  assert.deepEqual(migrateSettings({}), {});
});

test("does not mutate its input and is idempotent", () => {
  const input = { "clipper.saveDir": "/x/y" };
  const once = migrateSettings(input);
  assert.deepEqual(input, { "clipper.saveDir": "/x/y" });
  assert.deepEqual(migrateSettings(once), once);
});

test("load() migrates and writes the result back to disk", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-"));
  const file = path.join(dir, "settings.json");
  fs.writeFileSync(file, JSON.stringify({ "clipper.saveDir": "/v/clips", other: 1 }));
  const store = createSettingsStore(file);
  store.load();
  const onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(onDisk["clipper.clipsDir"], "/v/clips");
  assert.equal(onDisk["clipper.dataDir"], "/v/channel-data");
  assert.equal(onDisk.other, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
