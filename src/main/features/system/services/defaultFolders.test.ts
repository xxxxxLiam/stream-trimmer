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
import { defaultFolders } from "./systemService";

test("the default clips folder is Downloads/Clipr, and an old Videos/Clipr folder is left alone", async () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "home-"));
  const old = path.join(home, "Videos", "Clipr", "Clips");
  fs.mkdirSync(old, { recursive: true });
  fs.writeFileSync(path.join(old, "a.mp4"), "x");
  const app = { getPath: (n: string) => path.join(home, n === "downloads" ? "Downloads" : "Videos") } as never;
  const f = await defaultFolders(app);
  assert.equal(f?.clipsDir, path.join(home, "Downloads", "Clipr"));
  assert.ok(fs.statSync(f!.clipsDir).isDirectory());
  assert.ok(fs.existsSync(path.join(old, "a.mp4")), "the old folder and its clips stay where they were");
});
