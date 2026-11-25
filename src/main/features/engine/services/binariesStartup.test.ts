/**
 * File: binariesStartup.test.ts
 * Path: src/main/features/engine/services/binariesStartup.test.ts
 * Description: Choosing yt-dlp at start-up must not RUN any yt-dlp: on a Mac the first run of a freshly installed unsigned
 *   binary takes seconds, and the main process (which also serves the window) stands still meanwhile. A fake yt-dlp
 *   leaves a marker file whenever it is run; loading the module must leave none.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const here = path.dirname(new URL(import.meta.url).pathname);
const BINARIES = path.join(here, "binaries.ts");

function scenario(opts: { updated?: string; bundledVersion?: string }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "clipr-startup-"));
  const bin = path.join(root, "resources", "bin");
  const tools = path.join(root, "tools");
  const marker = path.join(root, "ran");
  fs.mkdirSync(bin, { recursive: true });
  fs.mkdirSync(tools, { recursive: true });
  const fake = `#!/bin/sh\necho ran >> "${marker}"\nsleep 2\necho 2020.01.01\n`;
  fs.writeFileSync(path.join(bin, "yt-dlp"), fake, { mode: 0o755 });
  if (opts.bundledVersion) fs.writeFileSync(path.join(bin, "yt-dlp.version"), `${opts.bundledVersion}\n`);
  if (opts.updated) fs.writeFileSync(path.join(tools, `yt-dlp-${opts.updated}`), fake, { mode: 0o755 });
  const code = `const t0 = Date.now(); const m = await import(${JSON.stringify(BINARIES)}); console.log(JSON.stringify({ ms: Date.now() - t0, binary: m.yt && m.yt.binary, version: m.yt && m.yt.version })); process.exit(0);`;
  const r = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", code], {
    cwd: path.resolve(here, "../../../../.."),
    encoding: "utf8",
    env: { ...process.env, ELECTRON_RESOURCES: path.join(root, "resources"), YT_CLIPPER_TOOLS_DIR: tools, PATH: `${bin}:${process.env.PATH}` },
  });
  const out = r.stdout.trim().split("\n").filter((l) => l.startsWith("{")).pop();
  const info = out ? JSON.parse(out) : null;
  const ran = fs.existsSync(marker);
  fs.rmSync(root, { recursive: true, force: true });
  return { info, ran, stderr: r.stderr, root };
}

test("start-up with an updated yt-dlp in the tools folder never runs a yt-dlp, and uses the updated one", { skip: process.platform === "win32" }, () => {
  const s = scenario({ updated: "2099.01.01" });
  assert.ok(s.info, s.stderr);
  assert.equal(s.ran, false, "a yt-dlp was run while the app was starting");
  assert.match(s.info.binary, /yt-dlp-2099\.01\.01$/);
  assert.equal(s.info.version, "2099.01.01");
  assert.ok(s.info.ms < 1500, `start-up took ${s.info.ms} ms`);
});

test("the version the build recorded beside the bundled yt-dlp is used without running it: a newer bundled one beats an older updated one", { skip: process.platform === "win32" }, () => {
  const s = scenario({ updated: "2025.01.01", bundledVersion: "2026.11.24" });
  assert.ok(s.info, s.stderr);
  assert.equal(s.ran, false);
  assert.match(s.info.binary, /resources\/bin\/yt-dlp$/);
  assert.equal(s.info.version, "2026.11.24");
});
