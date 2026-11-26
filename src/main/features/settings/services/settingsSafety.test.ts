/**
 * File: settingsSafety.test.ts
 * Path: src/main/features/settings/services/settingsSafety.test.ts
 * Description: E-3 and E-7. An unreadable settings.json is restored from the last good copy and the person is told;
 *   a page can only write known keys, small values, and cannot widen the folders the app may save into.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSettingsStore } from "./settingsStore";
import { APPROVED_ROOTS_KEY, ASSETS_LIBRARY_ADDED_KEY, ASSETS_LIBRARY_FOLDER_KEY, MAX_VALUE_BYTES, PAGE_KEYS, pageMayWrite } from "./settingsKeys";
import { allowedRoots } from "../../../shared/utils/pathSafety";

const GOOD = { "clipper.bank": [{ id: "a" }], "clipper.clipsDir": "/x/clips" };
function fresh() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-safe-"));
  return { dir, f: path.join(dir, "settings.json") };
}
function twoWrites(f: string) {
  const s = createSettingsStore(f);
  s.load();
  s.set("clipper.bank", [{ id: "a" }]);
  s.set("clipper.clipsDir", "/x/clips");
  s.set("clipper.dataDirConfirmed", true); // the second write is what leaves a good copy of the first
}

for (const [name, bytes] of [
  ["truncated", '{"clipper.bank": [{"id":'],
  ["null", "null"],
  ["NUL-filled", Buffer.alloc(64)],
  ["emptied", ""],
] as const) {
  test(`a ${name} settings.json is restored from the last good copy, the person is told, and the file is whole again`, () => {
    const { f } = fresh();
    twoWrites(f);
    fs.writeFileSync(f, bytes);
    const s = createSettingsStore(f);
    s.load();
    assert.deepEqual(s.all()["clipper.bank"], [{ id: "a" }]);
    assert.equal(s.all()["clipper.clipsDir"], "/x/clips");
    assert.equal(typeof s.restoredAt(), "number");
    assert.deepEqual(JSON.parse(fs.readFileSync(f, "utf8"))["clipper.bank"], [{ id: "a" }]);
  });
}

test("with no good copy an unreadable file is still kept aside and nothing is claimed restored", () => {
  const { f, dir } = fresh();
  fs.writeFileSync(f, "{not json");
  const s = createSettingsStore(f);
  s.load();
  assert.equal(s.restoredAt(), null);
  assert.ok(fs.readdirSync(dir).some((n) => n.includes(".corrupt-")));
});

test("every write keeps the file it replaces as settings.json.bak, and no half-written temp is left", () => {
  const { f, dir } = fresh();
  twoWrites(f);
  assert.ok(fs.existsSync(`${f}.bak`));
  assert.ok(!fs.existsSync(`${f}.tmp`));
  assert.ok(JSON.parse(fs.readFileSync(`${f}.bak`, "utf8"))["clipper.bank"]);
  assert.ok(dir);
});

test("a page may write known keys only and small values only, and never the approved folders", () => {
  assert.equal(pageMayWrite("clipper.bank", [1]), true);
  assert.equal(pageMayWrite("evil.key", 1), false);
  assert.equal(pageMayWrite("__proto__", { a: 1 }), false);
  assert.equal(pageMayWrite("clipper.bank", "x".repeat(MAX_VALUE_BYTES + 1)), false);
  assert.equal(pageMayWrite(APPROVED_ROOTS_KEY, ["/"]), false);
  assert.equal(pageMayWrite(42, 1), false);
});

test("a page may not write the Add to Final Cut library memory: it is main's own, not the page's", () => {
  assert.equal(pageMayWrite(ASSETS_LIBRARY_FOLDER_KEY, "/Users/a/Movies"), false);
  assert.equal(pageMayWrite(ASSETS_LIBRARY_ADDED_KEY, { "/L/A.fcpbundle": ["/clips/a.mp4"] }), false);
});

test("folders already chosen are carried into main's approved list once; a later settings change does not widen it", () => {
  const { f } = fresh();
  fs.writeFileSync(f, JSON.stringify({ "clipper.clipsDir": "/Users/a/Clips" }));
  const s = createSettingsStore(f);
  s.load();
  assert.deepEqual(s.all()[APPROVED_ROOTS_KEY], ["/Users/a/Clips"]);
  s.set("clipper.clipsDir", "/");
  assert.deepEqual(allowedRoots({}, s.all()[APPROVED_ROOTS_KEY]), ["/Users/a/Clips"]);
});

test("every settings key the renderer source names is one a page may write (so the allow-list never silently drops a save)", () => {
  const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../../../../renderer/src");
  const found = new Set<string>();
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) {
        for (const m of fs.readFileSync(p, "utf8").matchAll(/"(clipper\.[A-Za-z0-9_.]+)"/g)) found.add(m[1]);
      }
    }
  };
  walk(root);
  assert.ok(found.size > 20);
  for (const k of found) assert.ok(PAGE_KEYS.has(k), `${k} is written by the renderer but not allowed`);
});
