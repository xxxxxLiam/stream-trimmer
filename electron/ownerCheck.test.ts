/**
 * File: ownerCheck.test.ts
 * Path: electron/ownerCheck.test.ts
 * Description: export:save must refuse a non-owner, using the verdict main keeps
 * from owner:check. Only booleans may leave the main process.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";

const require = createRequire(import.meta.url);
const { createOwnerCheck } = require("./ownerCheck.cjs");

const hash = (id: string, salt: string) => `h(${id}|${salt})`;
const make = (id: string | null) => createOwnerCheck({ readMachineId: async () => id, hashMachineId: hash });

test("nobody is owner before a check has said so", () => {
  assert.equal(make("m1").isOwner(), false);
});

test("a matching hash makes this machine owner; the raw id and hash never come back", async () => {
  const o = make("m1");
  const r = await o.check([hash("m1", "s")], "s");
  assert.equal(r, true);
  assert.equal(o.isOwner(), true);
  assert.deepEqual(Object.keys(o).sort(), ["check", "isOwner"]);
});

test("a non-matching list, missing salt or unreadable id stays non-owner", async () => {
  const o = make("m1");
  assert.equal(await o.check([hash("other", "s")], "s"), false);
  assert.equal(o.isOwner(), false);
  assert.equal(await o.check([hash("m1", "s")], ""), false);
  assert.equal(await make(null).check([hash("m1", "s")], "s"), false);
  assert.equal(await o.check("nope" as never, "s"), false);
});

test("'*' admits any machine without reading the id", async () => {
  const o = createOwnerCheck({ readMachineId: async () => { throw new Error("no"); }, hashMachineId: hash });
  assert.equal(await o.check(["*"], "s"), true);
  assert.equal(o.isOwner(), true);
});

test("export:save checks the owner before it touches any file", () => {
  const src = readFileSync(new URL("./main.cjs", import.meta.url), "utf8");
  const start = src.indexOf('ipcMain.handle("export:save"');
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf("ipcMain.handle", start + 10));
  const guard = body.indexOf("ownerGate.isOwner()");
  const save = body.indexOf("saveExportFiles(");
  assert.ok(guard > 0, "export:save has no owner check");
  assert.ok(guard < save, "owner check must come before saveExportFiles");
});
