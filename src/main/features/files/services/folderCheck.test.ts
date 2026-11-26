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
  assert.deepEqual(checkFolder({ dirPath: dir }, [dir]), { ok: true });
  assert.deepEqual(fs.readdirSync(dir), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a folder that does not exist yet is fine (the save creates it); an unmounted drive is gone; a path through a file is blocked", () => {
  const dir = tmp();
  assert.deepEqual(checkFolder({ dirPath: path.join(dir, "nope", "deeper") }, [dir]), { ok: true }, "Liam 26 Nov: a new campaign folder is not a missing drive");
  assert.deepEqual(fs.readdirSync(dir), [], "nothing is created or left behind by the check");
  const gone = { statSync: (p: string) => { if (p === "/Volumes" || p === "/") return { isDirectory: () => true }; throw errno("ENOENT"); }, writeFileSync: () => {}, rmSync: () => {} };
  if (path.sep === "/") assert.deepEqual(checkFolder({ dirPath: "/Volumes/Work/Clipr/B-roll" }, ["/Volumes/Work/Clipr/B-roll"], { fs: gone }), { ok: false, problem: "gone" }, "the drive itself is missing");
  const file = path.join(dir, "a.txt");
  fs.writeFileSync(file, "x");
  assert.deepEqual(checkFolder({ dirPath: file }, [dir]), { ok: false, problem: "blocked" });
  assert.deepEqual(checkFolder({ dirPath: path.join(file, "sub") }, [dir]), { ok: false, problem: "blocked" }, "C4-5: ENOTDIR");
  const unmounted = { statSync: () => { throw errno("ENOTCONN"); }, writeFileSync: () => {}, rmSync: () => {} };
  assert.deepEqual(checkFolder({ dirPath: path.join(dir, "x") }, [dir], { fs: unmounted }), { ok: false, problem: "gone" });
  fs.rmSync(dir, { recursive: true, force: true });
});

test("a folder that is there but refuses the write is refused: EACCES, EPERM and a read-only volume", () => {
  for (const code of ["EACCES", "EPERM", "EROFS"]) {
    const f = { statSync: () => ({ isDirectory: () => true }), writeFileSync: () => { throw errno(code); }, rmSync: () => {} };
    assert.deepEqual(checkFolder({ dirPath: path.resolve("/x/clips") }, [path.resolve("/x")], { fs: f }), { ok: false, problem: "refused" }, code);
  }
});

test("a read-only folder: stat passes but the write is refused, so it is refused, not gone", () => {
  const f = { statSync: () => ({ isDirectory: () => true }), writeFileSync: () => { throw errno("EROFS"); }, rmSync: () => {} };
  assert.equal((checkFolder({ dirPath: path.resolve("/Volumes/Disk") }, [path.resolve("/Volumes")], { fs: f }) as { problem: string }).problem, "refused");
});

test("anything it cannot decide counts as fine: odd errors, a relative path, a malformed request", () => {
  const odd = { statSync: () => ({ isDirectory: () => true }), writeFileSync: () => { throw errno("EMFILE"); }, rmSync: () => {} };
  assert.deepEqual(checkFolder({ dirPath: path.resolve("/x") }, [path.resolve("/x")], { fs: odd }), { ok: true });
  for (const bad of [null, undefined, {}, { dirPath: 5 }, { dirPath: "relative/dir" }, { dirPath: "/a\0b" }]) assert.deepEqual(checkFolder(bad, [path.resolve("/x")]), { ok: true });
});

test("a probe that cannot be removed does not turn a good folder into a bad one", () => {
  const f = { statSync: () => ({ isDirectory: () => true }), writeFileSync: () => {}, rmSync: () => { throw errno("EBUSY"); } };
  assert.deepEqual(checkFolder({ dirPath: path.resolve("/x") }, [path.resolve("/x")], { fs: f }), { ok: true });
});

test("E3-3: a folder outside the chosen ones is refused without touching the disk: no existence answer, no probe file", () => {
  const chosen = tmp();
  const other = tmp();
  const touched: string[] = [];
  const spy = {
    statSync: (p: string) => (touched.push(`stat ${p}`), { isDirectory: () => true }),
    writeFileSync: (p: string) => void touched.push(`write ${p}`),
    rmSync: () => {},
  };
  for (const p of [other, "/etc/passwd", "/nonexistent/x", path.join(chosen, "..", "elsewhere")]) {
    assert.deepEqual(checkFolder({ dirPath: p }, [chosen], { fs: spy }), { ok: false, problem: "refused" }, p);
  }
  assert.deepEqual(touched, []);
  assert.deepEqual(fs.readdirSync(other), [], "no probe file left in an unapproved folder");
  // The chosen folder itself and a folder inside it are looked at.
  assert.deepEqual(checkFolder({ dirPath: chosen }, [chosen]), { ok: true });
  fs.mkdirSync(path.join(chosen, "Acme"));
  assert.deepEqual(checkFolder({ dirPath: path.join(chosen, "Acme") }, [chosen]), { ok: true });
  for (const d of [chosen, other]) fs.rmSync(d, { recursive: true, force: true });
});

test("E3-3: a link inside a chosen folder that leads outside it is refused", () => {
  const chosen = tmp();
  const other = tmp();
  fs.symlinkSync(other, path.join(chosen, "link"));
  assert.deepEqual(checkFolder({ dirPath: path.join(chosen, "link") }, [chosen]), { ok: false, problem: "refused" });
  assert.deepEqual(fs.readdirSync(other), []);
  for (const d of [chosen, other]) fs.rmSync(d, { recursive: true, force: true });
});
