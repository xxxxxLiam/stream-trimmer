#!/usr/bin/env node
/**
 * audit/run-1/area-E/scripts/stub-root.cjs <rootDir>
 *
 * Builds the harness stub root, then extends the generated fake yt-dlp with
 * the two things a CHANNEL export needs and a clip download does not:
 *
 *   1. a channel listing  — stub.json `info.entries` is already honoured by the
 *      harness stub (it dumps `info` verbatim for -J/--dump-single-json), so
 *      nothing is needed there; this script only documents it.
 *   2. a subtitle file    — the exporter asks for `--write-auto-subs
 *      --sub-format vtt -o <tmp>/sub` and then reads `<tmp>/*.en.vtt`. The
 *      stock stub copies fixture.mp4 to the output path instead, so transcripts
 *      always come back empty. The patch below writes `<out>.en.vtt` from
 *      stub.json `vtt` when the invocation asks for subtitles.
 *
 * Nothing in the product or in audit/harness is modified; the patch is applied
 * to the throwaway root's own copy of the stub.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(process.argv[2] || "");
if (!root) {
  console.error("usage: stub-root.cjs <rootDir>");
  process.exit(2);
}
const REPO = "/home/user/stream-trimmer";
execFileSync(
  process.execPath,
  [path.join(REPO, "audit/harness/make-stub-root.cjs"), root],
  { stdio: "inherit" },
);
fs.copyFileSync(
  path.join(REPO, "audit/fixtures/fixture.mp4"),
  path.join(root, "fixture.mp4"),
);

const stubPath = path.join(root, "resources", "bin", "yt-dlp");
let src = fs.readFileSync(stubPath, "utf8");

// Insert the subtitle branch just before the download branch.
const anchor = '  // Download: emit progress lines';
if (!src.includes(anchor)) {
  console.error("stub layout changed; patch anchor not found");
  process.exit(3);
}
const patch = `  // AUDIT AREA E: subtitle write. The channel exporter calls yt-dlp with
  // --write-auto-subs --sub-format vtt -o <tmp>/sub and then reads <tmp>/*.en.vtt.
  if (has("--write-auto-subs") || has("--write-subs")) {
    const out = valOf("-o") || valOf("--output");
    if (out && cfg.vtt) {
      try {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out + ".en.vtt", cfg.vtt);
      } catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
    }
    return;
  }

`;
src = src.replace(anchor, patch + anchor);
fs.writeFileSync(stubPath, src);
fs.chmodSync(stubPath, 0o755);
console.log(root);
