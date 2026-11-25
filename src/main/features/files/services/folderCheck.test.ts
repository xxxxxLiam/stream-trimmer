import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { checkFolder } from "./folderCheck";

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "clipr-folder-"));
const errno = (code: string) => Object.assign(new Error(code), { code });

test("a folder that takes files is ok, and the probe file is gone afterwards", () => {
  const dir = tmp();
  assert.deepEqual(checkFolder({ dirPath: dir }), { ok: true });
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a missing folder, a file where a folder should be, and an unmounted drive are all gone", () => {
  const dir = tmp();
  assert.deepEqual(checkFolder({ dirPath: path.join(dir, "nope", "deeper") }), { ok: false, problem: "gone" });
  const file = path.join(dir, "a.txt");
  fs.writeFileSync(file, "x");
  assert.deepEqual(checkFolder({ dirPath: file }), { ok: false, problem: "gone" });
  const unmounted = { statSync: () => { throw errno("ENOTCONN"); }, writeFileSync: () => {}, rmSync: () => {} };
  assert.deepEqual(checkFolder({ dirPath: path.join(dir, "x") }, { fs: unmounted }), { ok: false, problem: "gone" });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a folder that is there but refuses the write is refused: EACCES, EPERM and a read-only volume", () => {
  for (const code of ["EACCES", "EPERM", "EROFS"]) {
    const f = { statSync: () => ({ isDirectory: () => true }), writeFileSync: () => { throw errno(code); }, rmSync: () => {} };
    assert.deepEqual(checkFolder({ dirPath: path.resolve("/x/clips") }, { fs: f }), { ok: false, problem: "refused" }, code);
  }
});

test("a read-only folder: stat passes but the write is refused, so it is refused, not gone", () => {
  const f = { statSync: () => ({ isDirectory: () => true }), writeFileSync: () => { throw errno("EROFS"); }, rmSync: () => {} };
  assert.equal((checkFolder({ dirPath: path.resolve("/Volumes/Disk") }, { fs: f }) as { problem: string }).problem, "refused");
});

test("anything it cannot decide counts as fine: odd errors, a relative path, a malformed request", () => {
  const odd = { statSync: () => ({ isDirectory: () => true }), writeFileSync: () => { throw errno("EMFILE"); }, rmSync: () => {} };
  assert.deepEqual(checkFolder({ dirPath: path.resolve("/x") }, { fs: odd }), { ok: true });
  for (const bad of [null, undefined, {}, { dirPath: 5 }, { dirPath: "relative/dir" }, { dirPath: "/a\0b" }]) assert.deepEqual(checkFolder(bad), { ok: true });
});

test("a probe that cannot be removed does not turn a good folder into a bad one", () => {
  const f = { statSync: () => ({ isDirectory: () => true }), writeFileSync: () => {}, rmSync: () => { throw errno("EBUSY"); } };
  assert.deepEqual(checkFolder({ dirPath: path.resolve("/x") }, { fs: f }), { ok: true });
});
