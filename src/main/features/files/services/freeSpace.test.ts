/**
 * File: freeSpace.test.ts
 * Path: src/main/features/files/services/freeSpace.test.ts
 * Description: The free-space pre-check: warns only when clearly short, uses the tighter of destination and work
 *   folder, and never warns on an unknown amount.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { checkFreeSpace, freeMbAt } from "./freeSpace";

const MB = 1024 * 1024;
const disk = (free: Record<string, number>) => (dir: string) => {
  for (const k of Object.keys(free).sort((a, b) => b.length - a.length)) if (dir === k || dir.startsWith(`${k}/`)) return { bavail: free[k], bsize: MB };
  throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
};
const clip = { dirPath: "/clips/Acme", seconds: 120, quality: "1080", audio: false, segments: 1 };

test("room for the clip: ok, with the numbers", () => {
  const r = checkFreeSpace(clip, { statfs: disk({ "/clips": 5000, "/tmp": 5000 }), tmpDir: "/tmp" });
  assert.deepEqual(r, { ok: true, neededMb: 180, freeMb: 5000 });
});

test("clearly short on the destination: not ok, and the destination's number is quoted", () => {
  const r = checkFreeSpace(clip, { statfs: disk({ "/clips": 60, "/tmp": 5000 }), tmpDir: "/tmp" });
  assert.deepEqual(r, { ok: false, neededMb: 180, freeMb: 60 });
});

test("the work folder is the tighter one: it decides", () => {
  const r = checkFreeSpace(clip, { statfs: disk({ "/clips": 5000, "/tmp": 100 }), tmpDir: "/tmp" });
  assert.equal(r?.ok, false);
  assert.equal(r?.freeMb, 100);
});

test("a destination that does not exist yet is measured where it will be made", () => {
  assert.equal(freeMbAt("/clips/Acme/new", disk({ "/clips": 777 })), 777);
});

test("an unknown amount never warns", () => {
  const none = () => { throw new Error("no statfs"); };
  assert.deepEqual(checkFreeSpace(clip, { statfs: none, tmpDir: "/tmp" }), { ok: true, neededMb: 180, freeMb: null });
  // Only one side unknown: the other still decides.
  const r = checkFreeSpace(clip, { statfs: disk({ "/clips": 10 }), tmpDir: "/nowhere" });
  assert.deepEqual(r, { ok: false, neededMb: 180, freeMb: 10 });
});

test("enough to the megabyte is ok; one short is not", () => {
  assert.equal(checkFreeSpace(clip, { statfs: disk({ "/clips": 180, "/tmp": 180 }), tmpDir: "/tmp" })?.ok, true);
  assert.equal(checkFreeSpace(clip, { statfs: disk({ "/clips": 179, "/tmp": 999 }), tmpDir: "/tmp" })?.ok, false);
});

test("a joined clip of several parts needs room for both copies, audio needs far less", () => {
  const big = { statfs: disk({ "/clips": 99999, "/tmp": 99999 }), tmpDir: "/tmp" };
  assert.ok(checkFreeSpace({ ...clip, segments: 3 }, big)!.neededMb > checkFreeSpace(clip, big)!.neededMb);
  assert.ok(checkFreeSpace({ ...clip, audio: true }, big)!.neededMb < checkFreeSpace(clip, big)!.neededMb);
});

test("a bad request is not answered (the handler then says ok with nothing known)", () => {
  for (const bad of [null, {}, { ...clip, dirPath: "relative" }, { ...clip, dirPath: 5 }, { ...clip, seconds: -1 }, { ...clip, seconds: "x" }, { ...clip, seconds: 1e9 }, { ...clip, dirPath: "/a\0b" }]) {
    assert.equal(checkFreeSpace(bad), null);
  }
});
