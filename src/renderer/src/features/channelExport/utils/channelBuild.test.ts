/**
 * File: channelBuild.test.ts
 * Description: E-1 — a public build must not name the channel exporter anywhere; the owner
 *   build (VITE_ENABLE_CHANNEL_DATA=1) still must contain it. Builds both for real.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();
const NEEDLES = [
  "Channel data",
  "ui-channel-link",
  "Back to clipping",
  "Back to workspace",
  'onScreen("channel")',
  'screen==="channel"',
  "channelAvailable",
  "Exported channel data",
  "channel data",
];

function build(env: Record<string, string>): string {
  const out = mkdtempSync(join(tmpdir(), "chan-build-"));
  const r = spawnSync(join(root, "node_modules", ".bin", "vite"), ["build", "--outDir", out, "--emptyOutDir"], {
    cwd: root,
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const dir = join(out, "assets");
  const js = readdirSync(dir)
    .filter((f) => f.endsWith(".js"))
    .map((f) => readFileSync(join(dir, f), "utf8"))
    .join("\n");
  rmSync(out, { recursive: true, force: true });
  return js;
}

test("E-1: public build has no trace of the channel exporter; owner build keeps it", { timeout: 180_000 }, () => {
  const pub = build({ VITE_ENABLE_CHANNEL_DATA: "" });
  for (const n of NEEDLES) assert.ok(!pub.includes(n), `public bundle contains ${JSON.stringify(n)}`);
  const owner = build({ VITE_ENABLE_CHANNEL_DATA: "1" });
  assert.ok(owner.includes("Channel data"), "owner bundle still has the feature");
  assert.ok(owner.includes("Back to workspace"), "owner bundle keeps the way back from the exporter");
});
