/**
 * File: resumeCache.test.ts
 * Path: server/resumeCache.test.ts
 * Description: Tests for keyed work folders and JSONL checkpoints.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  CLIP_PREFIX,
  appendJsonl,
  clearCache,
  holdFolder,
  jobDir,
  markInUse,
  partialBytes,
  tryClaim,
  readJson,
  readJsonl,
  workDir,
  writeJson,
} from "./resumeCache";

test("same inputs reuse the same work folder", () => {
  const a = workDir(CLIP_PREFIX, ["url", "mp4", "1080", "0.00", "10.00"]);
  const b = workDir(CLIP_PREFIX, ["url", "mp4", "1080", "0.00", "10.00"]);
  assert.equal(a, b);
  fs.rmSync(a, { recursive: true, force: true });
});

test("changing any input yields a different folder", () => {
  const a = workDir(CLIP_PREFIX, ["url", "mp4", "1080", "0.00", "10.00"]);
  const b = workDir(CLIP_PREFIX, ["url", "mp4", "720", "0.00", "10.00"]);
  assert.notEqual(a, b);
  for (const d of [a, b]) fs.rmSync(d, { recursive: true, force: true });
});

test("partialBytes counts only part files", () => {
  const dir = workDir(CLIP_PREFIX, ["partial-test"]);
  fs.writeFileSync(path.join(dir, "clip.mp4.part"), "12345");
  fs.writeFileSync(path.join(dir, "clip.mp4"), "ignored");
  assert.equal(partialBytes(dir), 5);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("jsonl checkpoints append and survive a truncated line", () => {
  const dir = workDir(CLIP_PREFIX, ["jsonl-test"]);
  const file = path.join(dir, "rows.jsonl");
  appendJsonl(file, [{ id: 1 }, { id: 2 }]);
  appendJsonl(file, [{ id: 3 }]);
  fs.appendFileSync(file, '{"id":4');
  assert.deepEqual(readJsonl<{ id: number }>(file).map((r) => r.id), [1, 2, 3]);
  fs.rmSync(dir, { recursive: true, force: true });
});

test("writeJson/readJson round-trip, missing file reads as null", () => {
  const dir = workDir(CLIP_PREFIX, ["json-test"]);
  const file = path.join(dir, "selection.json");
  assert.equal(readJson(file), null);
  writeJson(file, { selected: ["a"] });
  assert.deepEqual(readJson<{ selected: string[] }>(file), { selected: ["a"] });
  fs.rmSync(dir, { recursive: true, force: true });
});

// clearCache() sweeps the OS temp dir, so these run against a private one.
function inPrivateTmp(fn: () => void) {
  const prev = process.env.TMPDIR;
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "rc-test-"));
  process.env.TMPDIR = root;
  try {
    fn();
  } finally {
    if (prev === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = prev;
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("G-1: jobDir gives every request its own folder even for identical inputs", () => {
  inPrivateTmp(() => {
    const a = jobDir(CLIP_PREFIX, ["same"]);
    const b = jobDir(CLIP_PREFIX, ["same"]);
    assert.notEqual(a, b);
    assert.ok(path.basename(a).startsWith(CLIP_PREFIX));
    assert.ok(fs.existsSync(a) && fs.existsSync(b));
  });
});

test("G-8: clearCache skips a folder that is in use until it is released", () => {
  inPrivateTmp(() => {
    const busy = workDir(CLIP_PREFIX, ["busy"]);
    const idle = workDir(CLIP_PREFIX, ["idle"]);
    const release = markInUse(busy);
    const first = clearCache();
    assert.deepEqual(first, { removed: 1, skipped: 1 });
    assert.ok(fs.existsSync(busy));
    assert.ok(!fs.existsSync(idle));
    release();
    release(); // idempotent
    assert.equal(clearCache().removed, 1);
    assert.ok(!fs.existsSync(busy));
  });
});

test("G-8: clearCache leaves a held (finished, uncollected) clip folder alone, until the hold lapses", () => {
  inPrivateTmp(() => {
    const dir = jobDir(CLIP_PREFIX, ["finished"]);
    fs.writeFileSync(path.join(dir, "clip.mp4"), "the only copy");
    holdFolder(dir, 60_000);
    assert.equal(clearCache().removed, 0);
    assert.ok(fs.existsSync(path.join(dir, "clip.mp4")));
    holdFolder(dir, -1);
    assert.equal(clearCache().removed, 1);
  });
});

test("G-1: tryClaim gives the shared folder to one job at a time", () => {
  inPrivateTmp(() => {
    const dir = workDir(CLIP_PREFIX, ["claim"]);
    const first = tryClaim(dir);
    assert.ok(first);
    assert.equal(tryClaim(dir), null);
    first!();
    assert.ok(tryClaim(dir));
  });
});
