/**
 * File: exportDest.test.ts
 * Path: electron/exportDest.test.ts
 * Description: export:save must check where it WRITES (exportSave.cjs:41-43),
 * not only where it reads from. Covers D-7 and the D-6 hole behind it.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const { saveExportFiles } = require("./exportSave.cjs");

function scene() {
  const tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "exportdest-")));
  const saveDir = path.join(tmpRoot, "chosen");
  fs.mkdirSync(saveDir);
  const exportDir = fs.mkdtempSync(path.join(tmpRoot, "ytchan-"));
  const src = path.join(exportDir, "videos.csv");
  fs.writeFileSync(src, "data");
  return { tmpRoot, saveDir, files: [{ name: "videos.csv", path: src }] };
}

test("folder '..' is refused and nothing lands in the parent", async () => {
  const s = scene();
  const r = await saveExportFiles({ dirPath: s.saveDir, folder: "..", files: s.files, tmpRoot: s.tmpRoot, allowedRoots: [s.saveDir] });
  assert.equal(r.ok, false);
  assert.equal(fs.existsSync(path.join(s.tmpRoot, "videos.csv")), false);
  assert.equal(fs.existsSync(s.files[0].path), true, "the source was not consumed");
});

test("a dirPath outside the allowed roots is refused", async () => {
  const s = scene();
  const other = fs.mkdtempSync(path.join(s.tmpRoot, "other-"));
  const r = await saveExportFiles({ dirPath: other, folder: "ok", files: s.files, tmpRoot: s.tmpRoot, allowedRoots: [s.saveDir] });
  assert.equal(r.ok, false);
  assert.equal(fs.existsSync(path.join(other, "ok")), false);
});

test("a file named '..' cannot escape the export folder", async () => {
  const s = scene();
  const r = await saveExportFiles({ dirPath: s.saveDir, folder: "ok", files: [{ name: "..", path: s.files[0].path }], tmpRoot: s.tmpRoot, allowedRoots: [s.saveDir] });
  assert.equal(r.ok, false);
});

test("a normal export inside the chosen folder still works", async () => {
  const s = scene();
  const r = await saveExportFiles({ dirPath: s.saveDir, folder: "ok", files: s.files, tmpRoot: s.tmpRoot, allowedRoots: [s.saveDir] });
  assert.equal(r.ok, true);
  assert.equal(fs.readFileSync(path.join(s.saveDir, "ok", "videos.csv"), "utf8"), "data");
});

test("folder '..' is refused by the containment check alone, with no roots given", async () => {
  const s = scene();
  const r = await saveExportFiles({ dirPath: s.saveDir, folder: "..", files: s.files, tmpRoot: s.tmpRoot });
  assert.equal(r.ok, false);
  assert.equal(fs.existsSync(path.join(s.tmpRoot, "videos.csv")), false);
});
