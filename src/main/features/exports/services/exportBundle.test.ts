/**
 * File: exportBundle.test.ts
 * Path: src/main/features/exports/services/exportBundle.test.ts
 * Description: E-15. The public main-process bundle carries none of the exporter's save code; an owner build
 *   still has it. Builds the bundle for real with scripts/build-main.cjs.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function build(flag: string): string {
  const out = mkdtempSync(join(tmpdir(), "main-build-"));
  const r = spawnSync("node", [join(root, "scripts", "build-main.cjs")], {
    cwd: root,
    env: { ...process.env, VITE_ENABLE_CHANNEL_DATA: flag, BUILD_MAIN_OUT: out },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return readFileSync(join(out, "main", "index.cjs"), "utf8");
}

test("a public main bundle has no exporter save code, and an owner build does", () => {
  const pub = build("");
  assert.ok(!pub.includes("ytchan-"), "public bundle names the exporter's folder prefix");
  assert.ok(!pub.includes("saveExportFiles"), "public bundle carries the export writer");
  const owner = build("1");
  assert.ok(owner.includes("ytchan-"));
  assert.ok(owner.includes("saveExportFiles"));
});
