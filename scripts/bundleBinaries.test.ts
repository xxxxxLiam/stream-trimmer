/**
 * File: bundleBinaries.test.ts
 * Path: scripts/bundleBinaries.test.ts
 * Description: Guards two real Mac v20.0.0 packaging bugs: the bgutil git clone cache shipping
 *   inside resources/bin (read-only pack files `xattr -dr` can't touch), and dangling
 *   node_modules/.bin CLI shims shipping inside the vendored pot-provider.
 */
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { minimatch } from "minimatch";

const require = createRequire(import.meta.url);
const { removeDanglingBin }: { removeDanglingBin: (serverDir: string) => void } = require("./bundle-binaries.cjs");

const root = process.cwd();

function binFilter(): string[] {
  const pkg = JSON.parse(require("node:fs").readFileSync(path.join(root, "package.json"), "utf8"));
  const entry = pkg.build.extraResources.find((r: { from: string }) => r.from === "resources/bin");
  assert.ok(entry, "package.json build.extraResources must have a resources/bin entry");
  return entry.filter;
}

function isShipped(filter: string[], relPath: string): boolean {
  let shipped = false;
  for (const pattern of filter) {
    if (pattern.startsWith("!")) {
      if (minimatch(relPath, pattern.slice(1), { dot: true })) shipped = false;
    } else if (minimatch(relPath, pattern, { dot: true })) {
      shipped = true;
    }
  }
  return shipped;
}

test("resources/bin's extraResources filter excludes .cache, so a vendored bgutil git clone never ships", () => {
  const filter = binFilter();
  assert.equal(
    isShipped(filter, ".cache/bgutil-src/.git/objects/pack/pack-abc.pack"),
    false,
    "the bgutil clone's read-only git pack files must not be packaged — macOS xattr -dr fails on them",
  );
  assert.equal(isShipped(filter, ".cache/ffmpeg-darwin-arm64.gz"), false);
  // An ordinary bundled binary must still ship.
  assert.equal(isShipped(filter, "yt-dlp"), true, "a real bundled binary must still be packaged");
});

test("removeDanglingBin deletes node_modules/.bin so a dangling shim never ships", () => {
  const serverDir = mkdtempSync(path.join(tmpdir(), "pot-provider-fixture-"));
  const binDir = path.join(serverDir, "node_modules", ".bin");
  mkdirSync(binDir, { recursive: true });
  // Simulate the real failure: a shim whose target package was removed by `npm prune --omit=dev`.
  symlinkSync(path.join(serverDir, "node_modules", "tldts", "bin", "cli.js"), path.join(binDir, "tldts"));
  try {
    removeDanglingBin(serverDir);
    assert.equal(existsSync(binDir), false, ".bin must be gone after removeDanglingBin");
  } finally {
    rmSync(serverDir, { recursive: true, force: true });
  }
});
