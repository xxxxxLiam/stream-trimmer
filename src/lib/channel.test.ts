import test from "node:test";
import assert from "node:assert/strict";
import { buildExportFolderName } from "./channel";

test("E-5: two exports of one channel on one day never share a folder", () => {
  const names = new Set<string>();
  for (let i = 0; i < 200; i++) names.add(buildExportFolderName("Test Channel"));
  assert.equal(names.size, 200);
});

test("E-5: the folder name still leads with the channel and the date", () => {
  const name = buildExportFolderName("Test Channel");
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(name.startsWith("Test Channel-export-") || name.startsWith("Test-Channel-export-"), name);
  assert.ok(name.includes(today), name);
  assert.ok(!/[\\/:*?"<>|]/.test(name));
});

test("E-5: a given instant and run id name a folder deterministically", () => {
  const at = new Date("2026-11-21T14:32:05Z");
  assert.equal(buildExportFolderName("Chan", at, "abc"), "Chan-export-2026-11-21-143205-abc");
});
