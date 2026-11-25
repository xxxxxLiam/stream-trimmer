/**
 * File: fcpLookFile.test.ts
 * Path: src/main/features/editor/services/fcpLookFile.test.ts
 * Description: The Final Cut look file reader against real files: a .fcpxmld bundle, a bare .fcpxml, .txt and
 *   .xml copies, and every way a wrong file fails. Fixtures are generated exports, never someone's real project.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { FCP_LOOK_MAX_BYTES } from "../../../../common/types/fcpLook";
import { sampleExport } from "../../../../common/utils/fcpLook.fixture";
import { readFcpLookFile } from "./fcpLookFile";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fcplook-"));
const put = (name: string, body: string | Buffer) => {
  const p = path.join(dir, name);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body);
  return p;
};
const reason = async (p: string) => {
  const r = await readFcpLookFile(p);
  assert.equal(r.ok, false, p);
  return r.ok ? "" : r.reason;
};

test("a .fcpxmld bundle is read through its Info.fcpxml", async () => {
  const bundle = path.join(dir, "My look.fcpxmld");
  put("My look.fcpxmld/Info.fcpxml", sampleExport());
  const r = await readFcpLookFile(bundle);
  assert.ok(r.ok);
  assert.equal(r.ok && r.fileName, "My look.fcpxmld");
  assert.deepEqual(r.ok && r.look.found, ["Scale 120%", "Color Board", "Volume"]);
});

test("a bare .fcpxml, a .txt copy and an .xml copy all give the same look, BOM or not", async () => {
  const want = await readFcpLookFile(put("a.fcpxml", sampleExport()));
  assert.ok(want.ok);
  for (const name of ["b.txt", "c.xml", "d.TXT"]) {
    const r = await readFcpLookFile(put(name, sampleExport()));
    assert.deepEqual(r.ok && r.look, want.ok && want.look, name);
  }
  const bom = await readFcpLookFile(put("e.txt", "﻿" + sampleExport()));
  assert.deepEqual(bom.ok && bom.look, want.ok && want.look);
});

test("a TextEdit rich-text copy (.rtf) reads like the plain one", async () => {
  const plain = await readFcpLookFile(put("p.txt", sampleExport()));
  const rtf = "{\\rtf1\\ansi{\\fonttbl}\\f0 " + sampleExport().split("\n").join("\\\n") + "}";
  const r = await readFcpLookFile(put("t.rtf", rtf));
  assert.ok(r.ok && plain.ok);
  assert.deepEqual(r.ok && r.look, plain.ok && plain.look);
});

test("each failure is one plain sentence: no clip, clip with no look, not XML, empty", async () => {
  assert.match(await reason(put("noclip.fcpxml", sampleExport({ noClip: true }))), /No video clip was found/);
  assert.match(await reason(put("nolook.fcpxml", sampleExport({ clipChildren: "" }))), /has no look on it/);
  assert.match(await reason(put("notes.txt", "Remember to buy milk.")), /does not look like a Final Cut XML export/);
  assert.match(await reason(put("empty.txt", "")), /empty/i);
});

test("the wrong kind of file, a folder that is not a bundle, and a bundle with no Info.fcpxml are refused", async () => {
  assert.match(await reason(put("movie.mov", "x")), /\.fcpxmld bundle/);
  fs.mkdirSync(path.join(dir, "plainfolder"), { recursive: true });
  assert.match(await reason(path.join(dir, "plainfolder")), /\.fcpxmld bundle/);
  fs.mkdirSync(path.join(dir, "Hollow.fcpxmld"), { recursive: true });
  assert.match(await reason(path.join(dir, "Hollow.fcpxmld")), /no Info\.fcpxml/);
});

test("a file over the size cap is refused without reading it, and a missing file cannot be read", async () => {
  const big = put("big.fcpxml", Buffer.alloc(FCP_LOOK_MAX_BYTES + 1, 32));
  assert.match(await reason(big), /too big/);
  assert.match(await reason(path.join(dir, "gone.fcpxml")), /could not be read/);
  assert.match(await reason(""), /\.fcpxmld bundle/);
});
