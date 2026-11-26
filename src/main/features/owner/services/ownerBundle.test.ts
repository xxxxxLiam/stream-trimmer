/**
 * File: ownerBundle.test.ts
 * Path: src/main/features/owner/services/ownerBundle.test.ts
 * Description: The packaged server must receive the owner list and salt in an owner
 * build (or the gate fails closed and the exporter is dead), and must contain
 * NONE of it in a public build (nobody else learns the feature exists).
 * Builds the server bundle for real with scripts/build-server.cjs.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const SALT = "salt-for-bundle-test-91f3";
const HASHES = ["a".repeat(64), "b".repeat(64)];

function build(env: Record<string, string>): { dir: string; file: string } {
  const dir = mkdtempSync(join(tmpdir(), "srv-build-"));
  symlinkSync(join(root, "node_modules"), join(dir, "node_modules"));
  const file = join(dir, "server.cjs");
  const r = spawnSync("node", [join(root, "scripts", "build-server.cjs")], {
    cwd: dir, // no .env here
    // CLIPR_DEV_BUILD=1: these tests read the bundle's own text, so they need the readable build
    // (see plans/code-protection-plan.md) — a hardened build moves these literals into an
    // obfuscated string array and the checks below would stop meaning anything.
    env: { ...process.env, VITE_ENABLE_CHANNEL_DATA: "", VITE_OWNER_MACHINES: "", VITE_OWNER_SALT: "", CLIPR_DEV_BUILD: "1", ...env, BUILD_SERVER_OUT: file },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return { dir, file };
}

function freePort(): Promise<number> {
  return new Promise((res) => {
    const s = createServer().listen(0, "127.0.0.1", () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
  });
}

async function exportStatus(file: string, dir: string): Promise<number> {
  const port = await freePort();
  const child = spawn("node", [file], { cwd: dir, env: { ...process.env, PORT: String(port), VITE_ENABLE_CHANNEL_DATA: "", VITE_OWNER_MACHINES: "", VITE_OWNER_SALT: "" }, stdio: "ignore" });
  try {
    for (let i = 0; i < 60; i++) {
      try {
        const r = await fetch(`http://127.0.0.1:${port}/api/channel/export`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{}",
        });
        return r.status;
      } catch {
        await new Promise((r) => setTimeout(r, 250));
      }
    }
    throw new Error("server did not start");
  } finally {
    child.kill();
  }
}

test("public server bundle contains no owner list, salt or setting name", { timeout: 60_000 }, () => {
  // Even with everything set in the shell, a public build must not pick it up.
  const { dir, file } = build({ VITE_OWNER_MACHINES: HASHES.join(","), VITE_OWNER_SALT: SALT });
  const js = readFileSync(file, "utf8");
  rmSync(dir, { recursive: true, force: true });
  for (const needle of [SALT, HASHES[0], HASHES[1], "VITE_OWNER", "api/channel/export"]) {
    assert.ok(!js.includes(needle), `public bundle contains ${JSON.stringify(needle)}`);
  }
});

test("owner server bundle carries the list and salt it was built with", { timeout: 60_000 }, () => {
  const { dir, file } = build({ VITE_ENABLE_CHANNEL_DATA: "1", VITE_OWNER_MACHINES: HASHES.join(","), VITE_OWNER_SALT: SALT });
  const js = readFileSync(file, "utf8");
  rmSync(dir, { recursive: true, force: true });
  assert.ok(js.includes(SALT), "salt baked in");
  for (const h of HASHES) assert.ok(js.includes(h), "hash baked in");
});

test("packaged owner server answers the exporter route; a public one is a 404", { timeout: 90_000 }, async () => {
  const owner = build({ VITE_ENABLE_CHANNEL_DATA: "1", VITE_OWNER_MACHINES: "*", VITE_OWNER_SALT: SALT });
  const pub = build({ VITE_OWNER_MACHINES: "*" });
  try {
    // 400 = the route ran and rejected the empty body; 404 = it is not there.
    assert.equal(await exportStatus(owner.file, owner.dir), 400);
    assert.equal(await exportStatus(pub.file, pub.dir), 404);
  } finally {
    rmSync(owner.dir, { recursive: true, force: true });
    rmSync(pub.dir, { recursive: true, force: true });
  }
});
