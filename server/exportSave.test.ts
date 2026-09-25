/**
 * File: exportSave.test.ts
 * Path: server/exportSave.test.ts
 * Description: Verifies the move that puts a finished channel export into the
 * user's save folder — in particular that it refuses any path the local engine
 * did not just write into its own temp folder.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const require = createRequire(import.meta.url);
const {
  saveExportFiles,
}: {
  saveExportFiles: (payload: {
    dirPath?: unknown;
    folder?: unknown;
    files?: unknown;
    tmpRoot: string;
  }) => Promise<{ ok: boolean; path?: string; error?: string }>;
} = require("../electron/exportSave.cjs");

interface Scene {
  tmpRoot: string;
  saveDir: string;
  exportDir: string;
  files: { name: string; path: string }[];
}

function scene(names = ["videos.csv", "comments.csv"]): Scene {
  const tmpRoot = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), "exportsave-")),
  );
  const saveDir = path.join(tmpRoot, "Documents");
  fs.mkdirSync(saveDir);
  const exportDir = fs.mkdtempSync(path.join(tmpRoot, "ytchan-"));
  const files = names.map((name) => {
    const full = path.join(exportDir, name);
    fs.writeFileSync(full, `contents of ${name}`);
    return { name, path: full };
  });
  return { tmpRoot, saveDir, exportDir, files };
}

test("moves the CSVs into a new folder and clears the temp dir", async () => {
  const s = scene();
  const result = await saveExportFiles({
    dirPath: s.saveDir,
    folder: "My Channel-export-2026-01-01",
    files: s.files,
    tmpRoot: s.tmpRoot,
  });

  assert.equal(result.ok, true);
  assert.equal(
    result.path,
    path.join(s.saveDir, "My Channel-export-2026-01-01"),
  );
  assert.deepEqual(fs.readdirSync(result.path!).sort(), [
    "comments.csv",
    "videos.csv",
  ]);
  assert.equal(
    fs.readFileSync(path.join(result.path!, "videos.csv"), "utf8"),
    "contents of videos.csv",
  );
  assert.equal(
    fs.existsSync(s.exportDir),
    false,
    "the engine's temp folder should be cleaned up",
  );
});

test("a path outside the engine's temp folder is refused", async () => {
  const s = scene();
  const outsider = path.join(s.tmpRoot, "Documents", "secrets.csv");
  fs.writeFileSync(outsider, "not ours");

  const result = await saveExportFiles({
    dirPath: s.saveDir,
    folder: "export",
    files: [{ name: "secrets.csv", path: outsider }],
    tmpRoot: s.tmpRoot,
  });

  assert.equal(result.ok, false);
  assert.match(result.error!, /Unexpected export location/);
  assert.ok(fs.existsSync(outsider), "the refused file must not be moved");
});

test("a folder that merely starts with the prefix elsewhere is refused", async () => {
  const s = scene();
  // Right name, wrong place: not a direct child of the temp root.
  const nested = path.join(s.exportDir, "ytchan-nested");
  fs.mkdirSync(nested);
  const sneaky = path.join(nested, "videos.csv");
  fs.writeFileSync(sneaky, "nope");

  const result = await saveExportFiles({
    dirPath: s.saveDir,
    folder: "export",
    files: [{ name: "videos.csv", path: sneaky }],
    tmpRoot: s.tmpRoot,
  });

  assert.equal(result.ok, false);
  assert.match(result.error!, /Unexpected export location/);
});

test("a name containing separators cannot escape the target folder", async () => {
  const s = scene(["videos.csv"]);
  const result = await saveExportFiles({
    dirPath: s.saveDir,
    folder: "../escaped",
    files: [{ name: "../../videos.csv", path: s.files[0].path }],
    tmpRoot: s.tmpRoot,
  });

  assert.equal(result.ok, true);
  // Both the folder and the file name are flattened rather than traversed.
  assert.equal(result.path, path.join(s.saveDir, ".._escaped"));
  assert.deepEqual(fs.readdirSync(result.path!), [".._.._videos.csv"]);
});

test("a malformed payload is rejected rather than half-applied", async () => {
  const s = scene();
  const base = { dirPath: s.saveDir, folder: "export", tmpRoot: s.tmpRoot };

  assert.equal((await saveExportFiles({ ...base, files: [] })).ok, false);
  assert.equal((await saveExportFiles({ ...base, files: "no" })).ok, false);
  assert.equal(
    (await saveExportFiles({ ...base, files: [{ name: "a.csv" }] })).ok,
    false,
  );
  assert.equal(
    (await saveExportFiles({ ...base, files: [{ path: s.files[0].path }] })).ok,
    false,
  );
  assert.equal(
    (await saveExportFiles({ dirPath: 5, folder: "x", files: [], tmpRoot: s.tmpRoot }))
      .ok,
    false,
  );
});

test("a file the engine never wrote is reported, not silently skipped", async () => {
  const s = scene();
  const result = await saveExportFiles({
    dirPath: s.saveDir,
    folder: "export",
    files: [{ name: "gone.csv", path: path.join(s.exportDir, "gone.csv") }],
    tmpRoot: s.tmpRoot,
  });

  assert.equal(result.ok, false);
  assert.match(result.error!, /Missing export file: gone\.csv/);
});
