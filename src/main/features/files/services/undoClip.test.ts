/**
 * File: undoClip.test.ts
 * Path: src/main/features/files/services/undoClip.test.ts
 * Description: Pins Undo's file removal: a clip inside the chosen folders goes to the trash and is
 *   not hard-deleted, a path outside them or a folder is refused and left alone, a missing file is
 *   fine, and a trash failure is reported in plain words.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { undoClipFile } from "./undoClip";

const base = fs.mkdtempSync(path.join(os.tmpdir(), "undo-"));
const clips = path.join(base, "Clips");
const other = path.join(base, "Other");
fs.mkdirSync(clips);
fs.mkdirSync(other);
test.after(() => fs.rmSync(base, { recursive: true, force: true }));

const mk = (dir: string, name: string) => {
  const f = path.join(dir, name);
  fs.writeFileSync(f, "x");
  return fs.realpathSync(f);
};

test("a clip inside a chosen folder is moved to the trash, not deleted outright", async () => {
  const f = mk(clips, "Honest Version.mp4");
  const trashed: string[] = [];
  const r = await undoClipFile(f, [fs.realpathSync(clips)], async (p) => void trashed.push(p));
  assert.deepEqual(r, { ok: true });
  assert.deepEqual(trashed, [f]);
  assert.ok(fs.existsSync(f), "removal is the trash call's job; the service never unlinks");
});

test("a file outside the chosen folders is refused and not touched", async () => {
  const f = mk(other, "Not Mine.mp4");
  const r = await undoClipFile(f, [fs.realpathSync(clips)], async () => assert.fail("must not trash"));
  assert.equal(r.ok, false);
  assert.match(r.error!, /isn't in one of your clip folders/);
});

test("a folder, a relative path and a non-string are refused", async () => {
  const roots = [fs.realpathSync(clips)];
  const never = async () => assert.fail("must not trash");
  assert.equal((await undoClipFile(clips, roots, never)).ok, false);
  assert.equal((await undoClipFile("Clips/a.mp4", roots, never)).ok, false);
  assert.equal((await undoClipFile(42, roots, never)).ok, false);
});

test("a clip that is already gone counts as undone", async () => {
  const r = await undoClipFile(path.join(clips, "gone.mp4"), [fs.realpathSync(clips)], async () => assert.fail("nothing to trash"));
  assert.deepEqual(r, { ok: true });
});

test("a trash failure is reported in plain words", async () => {
  const f = mk(clips, "Stuck.mp4");
  const r = await undoClipFile(f, [fs.realpathSync(clips)], async () => {
    throw new Error("EBUSY");
  });
  assert.equal(r.ok, false);
  assert.match(r.error!, /Couldn't move the clip to the Trash: EBUSY/);
});
