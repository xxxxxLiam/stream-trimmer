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
import { createOwnerCheck } from "./ownerCheck";

const hash = (id: string, salt: string) => `h(${id}|${salt})`;
const make = (id: string | null, baked: { list: string; salt: string } | null) =>
  createOwnerCheck({ readMachineId: async () => id, hashMachineId: hash, getBaked: () => baked });

test("a build with nothing baked in (every public build) has no owner", async () => {
  const o = make("m1", null);
  assert.equal(await o.isOwner(), false);
  assert.equal(await o.check(), false);
});

test("a baked hash that matches this machine makes it owner; raw id and hash never come back", async () => {
  const o = make("m1", { list: hash("m1", "s"), salt: "s" });
  assert.equal(await o.check(), true);
  assert.equal(await o.isOwner(), true);
  assert.deepEqual(Object.keys(o).sort(), ["check", "isOwner"]);
});

test("a baked list for another machine, a missing salt or an unreadable id is not owner", async () => {
  assert.equal(await make("m1", { list: hash("other", "s"), salt: "s" }).isOwner(), false);
  assert.equal(await make("m1", { list: hash("m1", "s"), salt: "" }).isOwner(), false);
  assert.equal(await make(null, { list: hash("m1", "s"), salt: "s" }).isOwner(), false);
  assert.equal(await make("m1", { list: "", salt: "s" }).isOwner(), false);
});

test("'*' baked into the build admits any machine without reading the id", async () => {
  const o = createOwnerCheck({
    readMachineId: async () => { throw new Error("no"); },
    hashMachineId: hash,
    getBaked: () => ({ list: "*", salt: "" }),
  });
  assert.equal(await o.isOwner(), true);
});

test("E2-2: nothing the renderer sends can change the verdict, before or after", async () => {
  // A non-owner build (list is another machine's) and a public build (nothing baked).
  for (const baked of [{ list: hash("other", "s"), salt: "s" }, null]) {
    const o = make("m1", baked);
    // The page's own forged answers: the wildcard, and this machine's real hash with a salt it chose.
    assert.equal(await (o.check as (...a: unknown[]) => Promise<boolean>)(["*"], ""), false);
    assert.equal(await o.isOwner(), false, "a forged wildcard flipped export:save's gate");
    assert.equal(await (o.check as (...a: unknown[]) => Promise<boolean>)([hash("m1", "mine")], "mine"), false);
    assert.equal(await o.isOwner(), false, "a forged hash flipped export:save's gate");
  }
});

test("main.ts does not register owner:check with the renderer's arguments", () => {
  const src = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  const line = src.split("\n").find((l) => l.includes('ipcMain.handle("owner:check"')) ?? "";
  assert.ok(line, "owner:check handler missing");
  assert.doesNotMatch(line, /\(_e,\s*\w+/, "owner:check must not take renderer arguments");
  assert.doesNotMatch(line, /check\([^)]+\)/, "owner:check must not forward arguments to the gate");
});

test("readBakedShape: no sidecar means no owner; a sidecar's list is what main uses", async () => {
  const { mkdtempSync, writeFileSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const { readBakedShape } = require("./ownerCheck.ts");
  const dir = mkdtempSync(join(tmpdir(), "shape-"));
  assert.equal(readBakedShape(dir), null);
  writeFileSync(join(dir, "build-shape.json"), "{not json");
  assert.equal(readBakedShape(dir), null);
  writeFileSync(join(dir, "build-shape.json"), JSON.stringify({ list: "AbC", salt: "s", dataFolderName: "x" }));
  assert.deepEqual(readBakedShape(dir), { list: "AbC", salt: "s", dataFolderName: "x" });
});

test("export:save checks the owner before it touches any file", () => {
  const src = readFileSync(new URL("./main.ts", import.meta.url), "utf8");
  const start = src.indexOf('ipcMain.handle("export:save"');
  assert.ok(start > 0);
  const body = src.slice(start, src.indexOf("ipcMain.handle", start + 10));
  const guard = body.indexOf("await ownerGate.isOwner()");
  const save = body.indexOf("saveExportFiles(");
  assert.ok(guard > 0, "export:save has no owner check");
  assert.ok(guard < save, "owner check must come before saveExportFiles");
});
