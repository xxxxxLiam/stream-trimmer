/**
 * File: startFresh.test.ts
 * Path: src/main/features/settings/services/startFresh.test.ts
 * Description: The one-time "start fresh" prompt: asked once on the first launch after updating, never on a fresh
 *   install; "Start fresh" backs up before clearing and never touches clip files; the answer is recorded.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { answerStartFresh, backupFolder, isStartFreshPending } from "./startFresh";
import { createSettingsStore } from "./settingsStore";

const OLD = {
  "clipper.campaigns": [{ id: "c1", name: "Acme" }],
  "clipper.bank": [{ id: "m1" }, { id: "m2" }],
  "clipper.downloads": [{ id: "d1" }],
  "clipper.clipsDir": "/x/clips",
  "clipper.approvedRoots": ["/x/clips"],
};
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "sf-"));
const open = (seed?: object) => {
  const dir = tmp();
  const f = path.join(dir, "settings.json");
  if (seed) fs.writeFileSync(f, JSON.stringify(seed));
  const s = createSettingsStore(f);
  s.load();
  return { s, f, dir };
};

test("an install that already holds data is asked once; a fresh install never is, even after it makes data", () => {
  const upd = open(OLD);
  assert.equal(isStartFreshPending(upd.s as never, {}), true);
  const fresh = open();
  assert.equal(isStartFreshPending(fresh.s as never, {}), false);
  fresh.s.set("clipper.campaigns", [{ id: "n" }]);
  fresh.s.set("clipper.bank", [{ id: "n" }]);
  const next = createSettingsStore(fresh.f);
  next.load();
  assert.equal(isStartFreshPending(next as never, {}), false, "data made later does not trigger it");
  assert.equal(isStartFreshPending(null, {}), false);
});

test("automated runs can switch the prompt off", () => {
  assert.equal(isStartFreshPending(open(OLD).s as never, { CLIPR_SKIP_START_FRESH: "1" }), false);
});

test("Keep my data changes nothing and is not asked again", () => {
  const { s, f } = open(OLD);
  const before = JSON.stringify(s.all()["clipper.bank"]);
  assert.deepEqual(answerStartFresh("keep", s as never, { documentsDir: tmp() }), { ok: true });
  assert.equal(JSON.stringify(s.all()["clipper.bank"]), before);
  const again = createSettingsStore(f);
  again.load();
  assert.equal(isStartFreshPending(again as never, {}), false);
  assert.equal(again.all()["clipper.startFreshAnswered"], "keep");
});

test("Start fresh backs everything up first, then clears it, and is not asked again", () => {
  const { s, f } = open(OLD);
  const docs = tmp();
  const clip = path.join(tmp(), "clip.mp4");
  fs.writeFileSync(clip, "video");
  const r = answerStartFresh("fresh", s as never, { documentsDir: docs, now: new Date(2026, 10, 25, 9, 0) });
  assert.equal(r.ok, true);
  const dir = (r as { backupDir: string }).backupDir;
  assert.equal(dir, path.join(docs, "Clipr backups", "2026-11-25"));
  const saved = JSON.parse(fs.readFileSync(path.join(dir, "settings.json"), "utf8"));
  assert.equal(saved["clipper.bank"].length, 2);
  assert.equal(saved["clipper.campaigns"][0].name, "Acme");
  assert.equal(saved["clipper.downloads"].length, 1);
  // Cleared: no campaigns, bank, history, or folder choice; main's approved folders stay so saving keeps working.
  const after = createSettingsStore(f);
  after.load();
  for (const k of ["clipper.campaigns", "clipper.bank", "clipper.downloads", "clipper.clipsDir"]) assert.equal(after.all()[k], undefined, k);
  assert.deepEqual(after.all()["clipper.approvedRoots"], ["/x/clips"]);
  assert.equal(isStartFreshPending(after as never, {}), false);
  assert.equal(after.all()["clipper.startFreshAnswered"], "fresh");
  assert.equal(fs.readFileSync(clip, "utf8"), "video", "clip files are never touched");
});

test("a second backup on the same day gets its own folder, nothing is overwritten", () => {
  const docs = tmp();
  const day = new Date(2026, 10, 25);
  const a = backupFolder(docs, day);
  fs.mkdirSync(a, { recursive: true });
  assert.equal(backupFolder(docs, day), `${a} 2`);
});

test("if the backup cannot be written nothing is cleared and nothing is recorded", () => {
  const { s, f } = open(OLD);
  const blocker = path.join(tmp(), "file-not-folder");
  fs.writeFileSync(blocker, "x");
  const r = answerStartFresh("fresh", s as never, { documentsDir: blocker });
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /nothing was changed/);
  const after = createSettingsStore(f);
  after.load();
  assert.equal(after.all()["clipper.bank"].length, 2);
  assert.equal(isStartFreshPending(after as never, {}), true, "still to be asked");
});

test("only the two choices are accepted", () => {
  const { s } = open(OLD);
  for (const bad of [undefined, "", "later", "FRESH", 1, {}]) assert.equal(answerStartFresh(bad, s as never, { documentsDir: tmp() }).ok, false);
  assert.equal(s.all()["clipper.bank"].length, 2);
});

test("an answered prompt is not due again in the same run, so a page reload cannot ask it twice", () => {
  for (const choice of ["keep", "fresh"] as const) {
    const { s } = open(OLD);
    assert.equal(isStartFreshPending(s as never, {}), true);
    assert.equal(answerStartFresh(choice, s as never, { documentsDir: tmp() }).ok, true);
    assert.equal(isStartFreshPending(s as never, {}), false, choice);
  }
});
