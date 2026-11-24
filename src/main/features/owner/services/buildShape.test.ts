/**
 * File: buildShape.test.ts
 * Path: src/main/features/owner/services/buildShape.test.ts
 * Description: The main process decides owner-ness from what the build baked in. An owner build
 * writes build-shape.json beside the server bundle; a public build writes none and removes a stale
 * one, so "no sidecar" always means "no exporter" and nothing from the renderer can stand in.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function build(env: Record<string, string>, dir: string) {
  const r = spawnSync("node", [join(root, "scripts", "build-server.cjs")], {
    cwd: dir, // no .env here
    env: { ...process.env, VITE_ENABLE_CHANNEL_DATA: "", VITE_OWNER_MACHINES: "", VITE_OWNER_SALT: "", ...env, BUILD_SERVER_OUT: join(dir, "out", "server.cjs") },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return join(dir, "out", "build-shape.json");
}

test("owner build writes the sidecar; the next public build removes it", () => {
  const dir = mkdtempSync(join(tmpdir(), "shape-build-"));
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const sidecar = build({ VITE_ENABLE_CHANNEL_DATA: "1", VITE_OWNER_MACHINES: "ab12,cd34", VITE_OWNER_SALT: "salt-xyz" }, dir);
  const shape = JSON.parse(readFileSync(sidecar, "utf8"));
  assert.equal(shape.list, "ab12,cd34");
  assert.equal(shape.salt, "salt-xyz");
  assert.ok(shape.dataFolderName);
  // A stale sidecar from the owner build must not survive a public build.
  build({}, dir);
  assert.equal(existsSync(sidecar), false);
});

test("a public build with owner variables in the shell still writes nothing", () => {
  const dir = mkdtempSync(join(tmpdir(), "shape-build-"));
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  writeFileSync(join(dir, "placeholder"), "");
  const sidecar = build({ VITE_OWNER_MACHINES: "*", VITE_OWNER_SALT: "salt-xyz" }, dir);
  assert.equal(existsSync(sidecar), false);
});
