/**
 * File: settingsRecovery.test.ts
 * Path: electron/settingsRecovery.test.ts
 * Description: G-12 — a recoverable settings.json (BOM, whitespace) loads
 * intact, and an unparseable one is kept beside the original before anything
 * replaces it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
import { createSettingsStore } from "./settingsStore";

const GOOD = { "clipper.bank": [{ id: "a" }, { id: "b" }], "clipper.clipsDir": "/x/clips" };
function file(content: string | Buffer) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "settings-rec-"));
  const f = path.join(dir, "settings.json");
  fs.writeFileSync(f, content);
  return { dir, f };
}
const backups = (dir: string) => fs.readdirSync(dir).filter((n) => n.includes(".corrupt-"));

test("a BOM-prefixed file loads with its data and survives the first write", () => {
  const { f, dir } = file("﻿" + JSON.stringify(GOOD, null, 2));
  const s = createSettingsStore(f);
  s.load();
  assert.equal(s.all()["clipper.bank"].length, 2);
  s.set("clipper.dataDirConfirmed", true);
  const after = JSON.parse(fs.readFileSync(f, "utf8"));
  assert.equal(after["clipper.bank"].length, 2);
  assert.equal(after["clipper.clipsDir"], "/x/clips");
  assert.deepEqual(backups(dir), [], "a recoverable file needs no backup");
});

test("leading/trailing whitespace and CRLF are tolerated", () => {
  const { f } = file("\r\n  " + JSON.stringify(GOOD) + "  \r\n\r\n");
  const s = createSettingsStore(f);
  s.load();
  assert.equal(s.all()["clipper.bank"].length, 2);
});

test("an unparseable file is preserved byte-for-byte before it is replaced", () => {
  const broken = JSON.stringify(GOOD).slice(0, -5); // truncated write
  const { f, dir } = file(broken);
  const logged: string[] = [];
  const s = createSettingsStore(f, { log: (m: string) => logged.push(m) });
  s.load();
  s.set("clipper.dataDirConfirmed", true);
  const kept = backups(dir);
  assert.equal(kept.length, 1);
  assert.equal(fs.readFileSync(path.join(dir, kept[0]), "utf8"), broken);
  assert.equal(logged.length, 1, "logged once, not on every write");
  // and the live file is valid again
  assert.equal(JSON.parse(fs.readFileSync(f, "utf8"))["clipper.dataDirConfirmed"], true);
});

test("a JSON array and trailing junk are preserved too", () => {
  for (const content of ["[1,2,3]", JSON.stringify(GOOD) + "\nJUNK"]) {
    const { f, dir } = file(content);
    const s = createSettingsStore(f);
    s.load();
    s.set("k", 1);
    const kept = backups(dir);
    assert.equal(kept.length, 1, content);
    assert.equal(fs.readFileSync(path.join(dir, kept[0]), "utf8"), content);
  }
});

test("two different broken files keep two different backups", () => {
  const { f, dir } = file("{broken one");
  const s = createSettingsStore(f);
  s.load();
  s.set("k", 1);
  fs.writeFileSync(f, "{broken two");
  s.set("k", 2);
  assert.equal(backups(dir).length, 2);
});

test("an empty or missing file needs no backup", () => {
  const { f, dir } = file("");
  createSettingsStore(f).load();
  const s = createSettingsStore(path.join(dir, "nope.json"));
  s.load();
  s.set("k", 1);
  assert.deepEqual(backups(dir), []);
});
