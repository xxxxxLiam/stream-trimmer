/**
 * File: fcpxmlWrite.test.ts
 * Description: D4-1. A later editor file never overwrites an earlier one: " 2", " 3" before the extension.
 */
import assert from "node:assert/strict";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { writeFcpxml } from "./editorOpen";

test("D4-1: writing the same file name twice keeps both", async () => {
  const dir = mkdtempSync(join(tmpdir(), "fcp-"));
  const a = (await writeFcpxml({ dirPath: dir, filename: "Event.fcpxml", contents: "<?xml first" })) as { ok: boolean; path?: string };
  const b = (await writeFcpxml({ dirPath: dir, filename: "Event.fcpxml", contents: "<?xml second" })) as { ok: boolean; path?: string };
  const c = (await writeFcpxml({ dirPath: dir, filename: "Event.fcpxml", contents: "<?xml third" })) as { ok: boolean; path?: string };
  assert.deepEqual(readdirSync(dir).sort(), ["Event 2.fcpxml", "Event 3.fcpxml", "Event.fcpxml"]);
  assert.equal(readFileSync(a.path as string, "utf8"), "<?xml first", "the first stays as it was");
  assert.match(b.path as string, /Event 2\.fcpxml$/);
  assert.match(c.path as string, /Event 3\.fcpxml$/);
});
