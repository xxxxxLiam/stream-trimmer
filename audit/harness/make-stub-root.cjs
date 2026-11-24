#!/usr/bin/env node
/**
 * File: make-stub-root.cjs
 * Path: audit/harness/make-stub-root.cjs
 * Description: Builds a throwaway root whose `resources/bin/yt-dlp` is a
 *   scriptable fake, so download and info flows can be driven offline and made
 *   to fail on purpose. ffmpeg and deno are symlinked to the real binaries so
 *   the cutting pipeline stays genuine — only the network part is faked.
 *
 *   Pass the resulting root as `cwd` to launchApp(); the server resolves
 *   binaries from `<cwd>/resources/bin` (src/main/features/engine/services/binaries.ts: resolveBinDir).
 *
 * Usage:  node audit/harness/make-stub-root.cjs <rootDir> [scriptFile]
 *
 * The stub reads its instructions from `<root>/stub.json`, which you can
 * rewrite between calls without relaunching the app:
 *
 *   {
 *     "info":      { "title": "...", "duration": 3600, "id": "abc" },
 *     "exitCode":  0,          // non-zero to make yt-dlp fail
 *     "stderr":    "",         // text to emit on failure
 *     "delayMs":   0,          // stall, for slow-network and cancel tests
 *     "progress":  [0, 25, 100],
 *     "writeMedia": true,      // copy the fixture clip to the output path
 *     "vtt": "WEBVTT...",      // text served as the transcript (or "vttFile": name beside stub.json)
 *   }
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(process.argv[2] || "");
if (!root) {
  console.error("usage: make-stub-root.cjs <rootDir>");
  process.exit(2);
}
const REPO = path.resolve(__dirname, "..", "..");
const bin = path.join(root, "resources", "bin");
fs.mkdirSync(bin, { recursive: true });

// Real ffmpeg/deno: the cut and concat must be genuine for the audit to mean
// anything. Only the network-facing tool is replaced.
const { execSync } = require("node:child_process");
const onPath = (n) => { try { return execSync(`command -v ${n}`, { encoding: "utf8" }).trim(); } catch { return ""; } };
for (const name of ["ffmpeg", "deno"]) {
  // The repo's bundled binary when there is one, then $STUB_BIN_DIR/<name>, then whatever is on PATH.
  const bundled = path.join(REPO, "resources", "bin", name);
  const extra = process.env.STUB_BIN_DIR ? path.join(process.env.STUB_BIN_DIR, name) : "";
  const real = fs.existsSync(bundled) ? bundled : extra && fs.existsSync(extra) ? extra : onPath(name) || bundled;
  const link = path.join(bin, name);
  if (fs.existsSync(real) && !fs.existsSync(link)) fs.symlinkSync(real, link);
}

const DEFAULTS = {
  info: { id: "stub0000001", title: "Stub video", duration: 3600, uploader: "Stub channel" },
  exitCode: 0,
  stderr: "",
  delayMs: 0,
  progress: [0, 50, 100],
  writeMedia: true,
};
const stubJson = path.join(root, "stub.json");
if (!fs.existsSync(stubJson)) {
  fs.writeFileSync(stubJson, JSON.stringify(DEFAULTS, null, 2));
}

const stub = `#!/usr/bin/env node
// Fake yt-dlp for audit runs. Behaviour comes from ../../stub.json.
const fs = require("node:fs");
const path = require("node:path");
const cfg = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, "..", "..", "stub.json"), "utf8")); }
  catch { return ${JSON.stringify(DEFAULTS)}; }
})();
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

function fail() {
  if (cfg.stderr) process.stderr.write(cfg.stderr + "\\n");
  process.exit(cfg.exitCode || 1);
}

async function main() {
  if (cfg.delayMs) await new Promise((r) => setTimeout(r, cfg.delayMs));
  if (cfg.exitCode) return fail();

  // Far-future version on purpose: src/main/features/engine/services/binaries.ts prefers whichever of the
  // bundled and system binaries reports the newer version, and a real yt-dlp
  // on PATH would otherwise win and reach for the network.
  if (has("--version")) { process.stdout.write("2099.12.31\\n"); return; }

  // Metadata probe: -J / --dump-json / --dump-single-json
  if (has("-J") || has("--dump-json") || has("--dump-single-json")) {
    const info = Object.assign({
      _type: "video", webpage_url: "https://www.youtube.com/watch?v=" + cfg.info.id,
      formats: [
        { format_id: "18",  ext: "mp4", height: 360,  vcodec: "avc1", acodec: "mp4a" },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" },
        { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a" },
      ],
      subtitles: {}, automatic_captions: {}, comments: [],
    }, cfg.info);
    process.stdout.write(JSON.stringify(info) + "\\n");
    return;
  }

  // Transcript: --skip-download with subtitles asks for <output>.en.vtt. cfg.vtt is the file's text.
  if (has("--skip-download") && (has("--write-subs") || has("--write-auto-subs"))) {
    const out = valOf("-o") || valOf("--output");
    const vtt = cfg.vttFile ? fs.readFileSync(path.join(__dirname, "..", "..", cfg.vttFile), "utf8") : cfg.vtt;
    if (out && vtt) fs.writeFileSync(out + ".en.vtt", vtt);
    return;
  }

  // Download: emit progress lines, then place the fixture at the output path.
  for (const p of cfg.progress || []) {
    process.stdout.write("[download]  " + p + ".0% of 10.00MiB at 1.00MiB/s ETA 00:01\\n");
    await new Promise((r) => setTimeout(r, 30));
  }
  if (cfg.writeMedia) {
    const out = valOf("-o") || valOf("--output");
    const fixture = path.join(__dirname, "..", "..", "fixture.mp4");
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

const stubPath = path.join(bin, "yt-dlp");
fs.writeFileSync(stubPath, stub);
fs.chmodSync(stubPath, 0o755);

console.log(root);
