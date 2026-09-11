/**
 * File: resumeCache.test.ts
 * Path: server/resumeCache.test.ts
 * Description: Tests for keyed work folders and JSONL checkpoints.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  CLIP_PREFIX,
  appendJsonl,
  partialBytes,
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
