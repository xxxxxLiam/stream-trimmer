import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { saveTextFile } from "./saveTextFile";

test("Save as .txt writes the text where the person chose, adding .txt when it is missing", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "clipr-txt-"));
  const res = await saveTextFile({ choose: async () => path.join(dir, "My list"), name: "x.txt", text: "1. Honest Version" });
  assert.deepEqual(res, { ok: true, path: path.join(dir, "My list.txt") });
  assert.equal(fs.readFileSync(path.join(dir, "My list.txt"), "utf8"), "1. Honest Version");
});

test("Save as .txt: cancelling writes nothing, and a write that fails says so", async () => {
  let wrote = false;
  const cancelled = await saveTextFile({ choose: async () => null, name: "x.txt", text: "a", write: async () => void (wrote = true) });
  assert.deepEqual(cancelled, { ok: false, cancelled: true });
  assert.equal(wrote, false);
  const failed = await saveTextFile({ choose: async () => "/nope/a.txt", name: "x.txt", text: "a", write: async () => { throw new Error("denied"); } });
  assert.deepEqual(failed, { ok: false, error: "denied" });
});

test("Save as .txt refuses an absurdly long list", async () => {
  const res = await saveTextFile({ choose: async () => "/tmp/a.txt", name: "x.txt", text: "a".repeat(5 * 1024 * 1024) });
  assert.equal(res.ok, false);
});
