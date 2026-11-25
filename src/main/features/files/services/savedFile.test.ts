/**
 * File: savedFile.test.ts
 * Description: A save that had to de-duplicate its name reports the name the file really got (C2-13).
 */
import assert from "node:assert/strict";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { moveWithoutOverwrite } from "../../../shared/utils/pathSafety";
import { savedResult } from "./savedFile";

test("a taken name is saved as ' 2' and the result says so, not the requested name", async () => {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "saved-"));
  await fsp.writeFile(path.join(dir, "Podcast Long.mp4"), "already here");
  const temp = path.join(dir, "temp.mp4");
  await fsp.writeFile(temp, "new clip");
  const target = await moveWithoutOverwrite(temp, path.join(dir, "Podcast Long.mp4"));
  const r = savedResult(target);
  assert.equal(r.fileName, "Podcast Long 2.mp4");
  assert.equal(r.path, path.join(dir, "Podcast Long 2.mp4"));
  assert.equal(await fsp.readFile(path.join(dir, "Podcast Long.mp4"), "utf8"), "already here", "nothing was overwritten");
});

test("a free name comes back unchanged", () => {
  assert.equal(savedResult("/clips/Acme/Hot Pick.mp4").fileName, "Hot Pick.mp4");
});
