/**
 * File: settingsLost.test.ts
 * Path: src/main/features/settings/services/settingsLost.test.ts
 * Description: E2-3. A settings file that is missing, `{}` or holds only unknown keys is restored from the last good
 *   copy; when nothing can be restored but the person clearly had data, the store says so, once.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createSettingsStore } from "./settingsStore";

const GOOD = { "clipper.bank": [{ id: 1 }, { id: 2 }], "clipper.clipsDir": "/x/clips" };
const dirOf = () => fs.mkdtempSync(path.join(os.tmpdir(), "lost-"));
const withBak = () => {
  const dir = dirOf();
  const f = path.join(dir, "settings.json");
  fs.writeFileSync(`${f}.bak`, JSON.stringify(GOOD));
  return { dir, f };
};

for (const [name, write] of [
  ["a deleted file", (f: string) => fs.rmSync(f, { force: true })],
  ["an empty object", (f: string) => fs.writeFileSync(f, "{}")],
  ["only unknown keys", (f: string) => fs.writeFileSync(f, '{"foo":1}')],
] as const) {
  test(`${name} with a good copy: the copy is restored and the copy itself is kept`, () => {
    const { f } = withBak();
    write(f);
    const s = createSettingsStore(f);
    s.load();
    assert.equal(s.all()["clipper.bank"].length, 2);
    assert.equal(typeof s.restoredAt(), "number");
    assert.equal(s.lost(), null);
    s.set("clipper.clipsDir", "/y");
    assert.equal(JSON.parse(fs.readFileSync(`${f}.bak`, "utf8"))["clipper.bank"].length, 2, "the good copy is not replaced by the empty file");
    assert.equal(JSON.parse(fs.readFileSync(f, "utf8"))["clipper.bank"].length, 2);
  });
}

test("a cut file with no copy: nothing comes back, the damaged file is kept, and the person is told once", () => {
  const dir = dirOf();
  const f = path.join(dir, "settings.json");
  fs.writeFileSync(f, JSON.stringify(GOOD).slice(0, 40));
  const s = createSettingsStore(f);
  s.load();
  assert.equal(s.lost(), "unreadable");
  assert.ok(fs.readdirSync(dir).some((n) => n.startsWith("settings.json.corrupt-")));
  // The next launch finds the same empty state and does not repeat the line.
  const again = createSettingsStore(f);
  again.load();
  assert.equal(again.lost(), null);
});

test("a deleted file with only a kept damaged copy beside it: the person is told it is missing", () => {
  const dir = dirOf();
  const f = path.join(dir, "settings.json");
  fs.writeFileSync(`${f}.corrupt-abc123`, "{ cut");
  const s = createSettingsStore(f);
  s.load();
  assert.equal(s.lost(), "missing");
});

test("a fresh install says nothing", () => {
  const dir = dirOf();
  const s = createSettingsStore(path.join(dir, "settings.json"));
  s.load();
  assert.equal(s.lost(), null);
  assert.equal(s.restoredAt(), null);
});

test("a person who removed everything on purpose is not 'restored' or 'lost' on the next launch", () => {
  const { f } = withBak();
  fs.writeFileSync(f, JSON.stringify(GOOD));
  const a = createSettingsStore(f);
  a.load();
  a.set("clipper.bank", null);
  a.set("clipper.clipsDir", null);
  const b = createSettingsStore(f);
  b.load();
  assert.equal(b.all()["clipper.bank"], undefined);
  assert.equal(b.restoredAt(), null);
  assert.equal(b.lost(), null);
});

test("a file Clipr itself wrote with nothing left in it is the person's real state, not a loss", () => {
  const { f } = withBak();
  fs.writeFileSync(f, '{"clipper.settingsWritten":1}');
  const s = createSettingsStore(f);
  s.load();
  assert.equal(s.restoredAt(), null);
  assert.equal(s.lost(), null);
  assert.equal(s.all()["clipper.bank"], undefined);
});
