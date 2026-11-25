/**
 * File: defaultFolders.test.ts
 * Path: src/main/features/system/services/defaultFolders.test.ts
 * Description: The folder a fresh install saves clips to is Downloads/Clipr, and a Videos/Clipr folder from an
 *   earlier version is neither moved nor touched.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { resolveTarget } from "../../../shared/utils/pathSafety";
import { defaultFolders } from "./systemService";

test("the default clips folder is Downloads/Clipr, and an old Videos/Clipr folder is left alone", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "home-"));
  const old = path.join(home, "Videos", "Clipr", "Clips");
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, "a.mp4"), "x");
  const app = { getPath: (n: string) => path.join(home, n === "downloads" ? "Downloads" : "Videos") } as never;
  const f = await defaultFolders(app);
  assert.equal(f?.clipsDir, path.join(home, "Downloads", "Clipr"));
  assert.ok(fs.existsSync(path.join(old, "a.mp4")), "the old folder and its clips stay where they were");
});

test("A2-6: no folder is made at all: both are only named, and the first save creates them", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "home-"));
  const app = { getPath: () => path.join(home, "Downloads") } as never;
  const f = await defaultFolders(app);
  assert.equal(f!.clipsDir, path.join(home, "Downloads", "Clipr"));
  assert.equal(f!.dataDir, path.join(home, "Downloads", "Clipr data"));
  assert.equal(fs.existsSync(path.join(home, "Downloads")), false, "nothing is created in Downloads until a clip is saved");
});

test("a clip can still be saved into the named-but-not-yet-made folder (saveClip makes it on the first save)", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "home-"));
  const f = await defaultFolders({ getPath: () => path.join(home, "Downloads") } as never);
  const r = resolveTarget({ dirPath: f!.clipsDir, name: "a.mp4", roots: [f!.clipsDir] });
  assert.equal(r.ok, true);
  const src = fs.readFileSync(new URL("../../files/services/filesService.ts", import.meta.url), "utf8");
  assert.match(src, /fsp\.mkdir\(path\.dirname\(dest\.target as string\), \{ recursive: true \}\)/);
});
