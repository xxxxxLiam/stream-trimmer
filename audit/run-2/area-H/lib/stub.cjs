/**
 * File: stub.cjs
 * Path: audit/run-1/area-H/lib/stub.cjs
 * Description: Builds area-H's stub root (shared harness make-stub-root.cjs)
 *   and adds one behaviour the shared stub lacks: the `--simulate` auth probe
 *   prints yt-dlp's real "Found YouTube account cookies" marker, which is what
 *   server/youtubeAuth.ts classifies as signed_in. Without it no offline run
 *   can ever get past the sign-in modal, and area H must measure every screen
 *   behind it. Audit-only; no product code is touched.
 */
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const REPO = "/home/user/stream-trimmer";

function buildStubRoot(root) {
  fs.mkdirSync(root, { recursive: true });
  execFileSync("node", [path.join(REPO, "audit/harness/make-stub-root.cjs"), root], {
    stdio: "pipe",
  });
  fs.copyFileSync(path.join(REPO, "audit/fixtures/fixture.mp4"), path.join(root, "fixture.mp4"));

  const binPath = path.join(root, "resources", "bin", "yt-dlp");
  let src = fs.readFileSync(binPath, "utf8");
  const marker = 'if (cfg.delayMs)';
  const inject = [
    '// area-H: the auth probe runs with --simulate. Emit the marker real yt-dlp',
    '// prints for a signed-in cookie jar so the offline run can reach the app.',
    'if (has("--simulate") && !cfg.authFail) {',
    '  process.stderr.write("[debug] Found YouTube account cookies\\n");',
    '  process.stdout.write("[youtube] stub: simulating\\n");',
    '  process.exit(0);',
    '}',
    marker,
  ].join("\n  ");
  if (!src.includes("area-H")) src = src.replace(marker, inject);
  fs.writeFileSync(binPath, src);
  fs.chmodSync(binPath, 0o755);
  return root;
}

/** Rewrite stub.json between calls; no relaunch needed. */
function script(root, cfg) {
  const file = path.join(root, "stub.json");
  const cur = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...cur, ...cfg }, null, 2));
}

module.exports = { buildStubRoot, script };
