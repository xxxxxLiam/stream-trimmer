/**
 * File: pathSafety.test.ts
 * Path: electron/pathSafety.test.ts
 * Description: Pins the save containment (D-6, D-7), the non-destructive move
 * (D-2) and the drag-target check (D-1) in electron/pathSafety.ts.
 */
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
import * as ps from "./pathSafety";

const sha = (f: string) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex");
const tmp = () => fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "pathsafety-")));

test("resolveTarget: a name inside the folder is allowed", () => {
  const root = tmp();
  const r = ps.resolveTarget({ dirPath: root, name: "a.csv", roots: [root] });
  assert.equal(r.ok, true);
  assert.equal(r.target, path.join(root, "a.csv"));
});

test("resolveTarget: a bare '..' folder name is refused (D-7)", () => {
  const root = tmp();
  const chosen = path.join(root, "chosen");
  fs.mkdirSync(chosen);
  assert.equal(ps.resolveTarget({ dirPath: chosen, name: ".." }).ok, false);
  assert.equal(ps.resolveTarget({ dirPath: chosen, name: "." }).ok, false);
  assert.equal(ps.resolveTarget({ dirPath: chosen, name: "" }).ok, false);
});

test("resolveTarget: '../..' and '../outside' stay contained as literal names", () => {
  const chosen = tmp();
  for (const name of ["../..", "../outside"]) {
    const r = ps.resolveTarget({ dirPath: chosen, name });
    assert.equal(r.ok, true, name);
    assert.equal(path.dirname(r.target as string), chosen);
  }
});

test("resolveTarget: a folder outside every allowed root is refused (D-6)", () => {
  const chosen = tmp();
  const elsewhere = tmp();
  const r = ps.resolveTarget({ dirPath: elsewhere, name: ".bashrc", roots: [chosen] });
  assert.equal(r.ok, false);
  assert.equal(ps.resolveTarget({ dirPath: "relative/dir", name: "x", roots: [chosen] }).ok, false);
});

test("resolveTarget: a symlink inside the chosen folder cannot lead out of it", () => {
  const chosen = tmp();
  const outside = tmp();
  fs.symlinkSync(outside, path.join(chosen, "link"));
  const r = ps.resolveTarget({ dirPath: path.join(chosen, "link"), name: "x.txt", roots: [chosen] });
  assert.equal(r.ok, false);
});

test("allowedRoots: collects settings folders and picked folders, ignores junk", () => {
  const roots = ps.allowedRoots(
    {
      "clipper.saveDir": "/a",
      "clipper.saveDirs": ["/b", 5, "rel"],
      "clipper.clipsDir": "/c",
      "clipper.dataDir": "",
    },
    ["/d"],
  );
  assert.deepEqual([...roots].sort(), ["/a", "/b", "/c", "/d"]);
});

test("moveWithoutOverwrite: an existing clip is left untouched; the new one gets ' 2' (D-2)", async () => {
  const dir = tmp();
  const existing = path.join(dir, "clip.mp4");
  fs.writeFileSync(existing, "ORIGINAL-BYTES");
  const before = { ino: fs.statSync(existing).ino, size: fs.statSync(existing).size, sha: sha(existing) };

  const srcDir = tmp();
  const src = path.join(srcDir, "new.mp4");
  fs.writeFileSync(src, "NEW-BYTES");
  const used = await ps.moveWithoutOverwrite(src, existing);

  assert.equal(used, path.join(dir, "clip 2.mp4"));
  assert.equal(fs.statSync(existing).ino, before.ino);
  assert.equal(fs.statSync(existing).size, before.size);
  assert.equal(sha(existing), before.sha);
  assert.equal(fs.readFileSync(used, "utf8"), "NEW-BYTES");
  assert.equal(fs.existsSync(src), false, "the temp file is gone after the move");
});

test("moveWithoutOverwrite: counts on to ' 3' when ' 2' is taken too", async () => {
  const dir = tmp();
  fs.writeFileSync(path.join(dir, "c.mp4"), "1");
  fs.writeFileSync(path.join(dir, "c 2.mp4"), "2");
  const src = path.join(tmp(), "n.mp4");
  fs.writeFileSync(src, "3");
  assert.equal(await ps.moveWithoutOverwrite(src, path.join(dir, "c.mp4")), path.join(dir, "c 3.mp4"));
});

test("moveWithoutOverwrite: free name is used as is", async () => {
  const dir = tmp();
  const src = path.join(tmp(), "n.mp4");
  fs.writeFileSync(src, "x");
  assert.equal(await ps.moveWithoutOverwrite(src, path.join(dir, "fresh.mp4")), path.join(dir, "fresh.mp4"));
});

test("writeWithoutOverwrite: never replaces an existing file", async () => {
  const dir = tmp();
  const f = path.join(dir, "comments.csv");
  fs.writeFileSync(f, "KEEP");
  const used = await ps.writeWithoutOverwrite(f, Buffer.from("NEW"));
  assert.equal(fs.readFileSync(f, "utf8"), "KEEP");
  assert.equal(used, path.join(dir, "comments 2.csv"));
  assert.equal(fs.readFileSync(used, "utf8"), "NEW");
});

test("dragTarget: only a real file inside an allowed folder (D-1 guard)", () => {
  const root = tmp();
  const file = path.join(root, "clip.mp4");
  fs.writeFileSync(file, "x");
  const outside = path.join(tmp(), "o.mp4");
  fs.writeFileSync(outside, "x");
  assert.equal(ps.dragTarget(file, [root]), file);
  assert.equal(ps.dragTarget(outside, [root]), null);
  assert.equal(ps.dragTarget(root, [root]), null, "a directory is not draggable");
  assert.equal(ps.dragTarget("/etc/hostname", [root]), null);
  assert.equal(ps.dragTarget("clip.mp4", [root]), null);
  assert.equal(ps.dragTarget(42, [root]), null);
  assert.equal(ps.dragTarget(path.join(root, "missing.mp4"), [root]), null);
});
