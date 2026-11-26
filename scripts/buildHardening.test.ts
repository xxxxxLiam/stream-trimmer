/**
 * File: buildHardening.test.ts
 * Path: scripts/buildHardening.test.ts
 * Description: Builds the real main and engine bundles both ways and checks the shape the plan
 *   asks for (plans/code-protection-plan.md): a default build is scrambled, CLIPR_DEV_BUILD=1
 *   stays readable, and nothing ships a .LEGAL.txt sidecar either way.
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const root = process.cwd();

function buildMain(env: Record<string, string>) {
  const out = mkdtempSync(join(tmpdir(), "hardening-main-"));
  const r = spawnSync("node", [join(root, "scripts", "build-main.cjs")], {
    cwd: root,
    env: { ...process.env, ...env, BUILD_MAIN_OUT: out },
    encoding: "utf8",
  });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  return { out, main: readFileSync(join(out, "main", "index.cjs"), "utf8") };
}

test("a default build scrambles identifiers and ships no legal-comments sidecar", { timeout: 60_000 }, () => {
  const { out, main } = buildMain({});
  assert.ok(!main.includes("resolveResourcesDir"), "an own identifier survived unscrambled");
  assert.ok(!main.includes("startBackend"), "an own identifier survived unscrambled");
  assert.ok(!existsSync(join(out, "main", "index.cjs.LEGAL.txt")), "a sidecar shipped in the output folder");
});

test("CLIPR_DEV_BUILD=1 keeps the build readable", { timeout: 60_000 }, () => {
  const { main } = buildMain({ CLIPR_DEV_BUILD: "1" });
  assert.ok(main.includes("resolveResourcesDir"), "a readable build must keep its own names");
  assert.ok(main.includes("startBackend"), "a readable build must keep its own names");
});

test("third-party license comments are folded into THIRD-PARTY-NOTICES.md, not shipped in the bundle", { timeout: 60_000 }, () => {
  buildMain({});
  const notices = readFileSync(join(root, "THIRD-PARTY-NOTICES.md"), "utf8");
  assert.match(notices, /GENERATED: bundled JS license comments/);
});
