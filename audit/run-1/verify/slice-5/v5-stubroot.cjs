#!/usr/bin/env node
/**
 * File: v5-stubroot.cjs
 * Path: audit/run-1/verify/slice-5/v5-stubroot.cjs
 * Description: Slice-5 verifier's OWN stub root. Wraps the shared harness stub
 *   and replaces resources/bin/yt-dlp with a superset that also answers the
 *   auth probe (--simulate --verbose) as signed in, so the sign-in modal is not
 *   covering the workspace for the layout/bank findings. A `signedIn:false`
 *   switch in stub.json turns that off again so H-2 can be measured with the
 *   real modal up.
 *
 *   Audit-only. No product code is read into, copied into or changed by this.
 *
 * Usage: node v5-stubroot.cjs <rootDir>
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const root = path.resolve(process.argv[2] || "");
if (!root) {
  console.error("usage: v5-stubroot.cjs <rootDir>");
  process.exit(2);
}

execFileSync(
  process.execPath,
  [path.join(REPO, "audit", "harness", "make-stub-root.cjs"), root],
  { stdio: "inherit" },
);

fs.copyFileSync(
  path.join(REPO, "audit", "fixtures", "fixture.mp4"),
  path.join(root, "fixture.mp4"),
);

const DEFAULTS = {
  info: {
    id: "stub0000001",
    title: "Stub video",
    duration: 3600,
    uploader: "Stub channel",
  },
  exitCode: 0,
  stderr: "",
  delayMs: 0,
  progress: [0, 50, 100],
  writeMedia: true,
  signedIn: true,
};

const stub = `#!/usr/bin/env node
// Slice-5 verifier's fake yt-dlp. Behaviour comes from ../../stub.json.
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
function cfg() {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "stub.json"), "utf8")); }
  catch { return ${JSON.stringify(DEFAULTS)}; }
}
const c = cfg();
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

async function main() {
  if (has("--version")) { process.stdout.write("2099.12.31\\n"); return; }

  // The auth probe: server/index.ts probeOnce() runs yt-dlp with
  // { simulate: true, verbose: true }. classifyYouTubeAuthOutput() looks for
  // yt-dlp's own "Found YouTube account cookies" marker.
  if (has("--simulate")) {
    if (c.signedIn === false) {
      process.stderr.write("ERROR: Sign in to confirm your age\\n");
      process.exit(1);
    }
    process.stdout.write("[debug] Found YouTube account cookies\\n");
    return;
  }

  if (c.delayMs) await new Promise((r) => setTimeout(r, c.delayMs));
  if (c.exitCode) {
    if (c.stderr) process.stderr.write(c.stderr + "\\n");
    process.exit(c.exitCode);
  }

  if (has("-J") || has("--dump-json") || has("--dump-single-json")) {
    const info = Object.assign({
      _type: "video",
      webpage_url: "https://www.youtube.com/watch?v=" + c.info.id,
      formats: [
        { format_id: "18",  ext: "mp4", height: 360,  vcodec: "avc1", acodec: "mp4a" },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" },
        { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a" },
      ],
      subtitles: {}, automatic_captions: {}, comments: [],
    }, c.info);
    process.stdout.write(JSON.stringify(info) + "\\n");
    return;
  }

  for (const p of c.progress || []) {
    process.stdout.write("[download]  " + p + ".0% of 10.00MiB at 1.00MiB/s ETA 00:01\\n");
    await new Promise((r) => setTimeout(r, 30));
  }
  if (c.writeMedia) {
    const out = valOf("-o") || valOf("--output");
    const fixture = path.join(ROOT, "fixture.mp4");
    if (out && fs.existsSync(fixture)) {
      const target = out.replace(/%\\(.*?\\)s/g, "stub");
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(fixture, target);
      } catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
    }
  }
}
main().catch((e) => { process.stderr.write(String(e) + "\\n"); process.exit(1); });
`;

fs.writeFileSync(path.join(root, "stub.json"), JSON.stringify(DEFAULTS, null, 2));
const stubPath = path.join(root, "resources", "bin", "yt-dlp");
fs.writeFileSync(stubPath, stub);
fs.chmodSync(stubPath, 0o755);
console.log(root);
