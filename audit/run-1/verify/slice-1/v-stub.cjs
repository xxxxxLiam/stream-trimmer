#!/usr/bin/env node
/**
 * File: v-stub.cjs
 * Path: audit/run-1/verify/slice-1/v-stub.cjs
 * Description: Slice-1 verification stub root. Written independently of any
 *   area's helper: it wraps the official harness stub (audit/harness/make-stub-root.cjs)
 *   and then replaces resources/bin/yt-dlp with a superset that also
 *     - answers the auth probe (`--simulate --verbose`) as signed in, so the
 *       YouTube connect modal does not gate the workspace,
 *     - writes a real WebVTT file for /api/transcript, and
 *     - honours --download-sections with the real ffmpeg so clip durations mean
 *       something.
 *   Audit-only scaffolding. No product code is touched.
 *
 * Usage: node v-stub.cjs <rootDir>
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "..", "..", "..", "..");
const root = path.resolve(process.argv[2] || "");
if (!root) {
  console.error("usage: v-stub.cjs <rootDir>");
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
    title: "Verify video",
    duration: 1800,
    uploader: "Verify channel",
  },
  exitCode: 0,
  stderr: "",
  delayMs: 0,
  progress: [0, 50, 100],
  writeMedia: true,
  signedIn: true,
  vttCues: 60,
  vttCueSec: 4,
  vttAvailable: true,
};

const stub = `#!/usr/bin/env node
// slice-1 verification fake yt-dlp. Config: ../../stub.json
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
let c;
try { c = JSON.parse(fs.readFileSync(path.join(ROOT, "stub.json"), "utf8")); }
catch { c = ${JSON.stringify(DEFAULTS)}; }
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
try { fs.appendFileSync(path.join(ROOT, "calls.log"), JSON.stringify(argv) + "\\n"); } catch {}

function hhmmss(s) {
  const p = (n) => String(Math.floor(n)).padStart(2, "0");
  return p(s / 3600) + ":" + p((s % 3600) / 60) + ":" + p(s % 60) + ".000";
}
function vtt(n, step) {
  let out = "WEBVTT\\n\\n";
  for (let i = 0; i < n; i++) {
    const a = i * step;
    out += hhmmss(a) + " --> " + hhmmss(a + step) + "\\n";
    if (i === 9) out += "here is the needle we search for\\n\\n";
    else out += "caption row " + i + " ordinary words here\\n\\n";
  }
  return out;
}

async function main() {
  if (has("--version")) { process.stdout.write("2099.12.31\\n"); return; }
  if (c.delayMs) await new Promise((r) => setTimeout(r, c.delayMs));

  // auth probe before any scripted failure, so a failing download does not
  // also sign the user out.
  if (has("--simulate")) {
    if (c.signedIn === false) { process.stderr.write("ERROR: Sign in to confirm your age\\n"); process.exit(1); }
    process.stderr.write("[debug] [youtube] Found YouTube account cookies\\n");
    return;
  }

  if (c.exitCode) {
    if (c.stderr) process.stderr.write(c.stderr + "\\n");
    process.exit(c.exitCode);
  }

  if (has("-J") || has("--dump-json") || has("--dump-single-json")) {
    process.stdout.write(JSON.stringify(Object.assign({
      _type: "video",
      webpage_url: "https://www.youtube.com/watch?v=" + c.info.id,
      formats: [
        { format_id: "18",  ext: "mp4", height: 360,  vcodec: "avc1", acodec: "mp4a" },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" },
        { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a" },
      ],
      subtitles: {}, automatic_captions: {}, comments: [],
    }, c.info)) + "\\n");
    return;
  }

  if (has("--skip-download") && (has("--write-auto-subs") || has("--write-subs"))) {
    if (c.vttAvailable === false) return;
    const out = valOf("-o") || valOf("--output");
    if (out) {
      const target = String(out).replace(/%\\(.*?\\)s/g, "stub") + ".en.vtt";
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, vtt(c.vttCues || 60, c.vttCueSec || 4));
    }
    return;
  }

  for (const p of c.progress || []) {
    process.stdout.write("[download]  " + p + ".0% of 10.00MiB at 1.00MiB/s ETA 00:01\\n");
    await new Promise((r) => setTimeout(r, 30));
  }
  if (!c.writeMedia) return;
  const out = valOf("-o") || valOf("--output");
  const fixture = path.join(ROOT, "fixture.mp4");
  if (!out || !fs.existsSync(fixture)) return;
  const target = String(out).replace(/%\\(.*?\\)s/g, "stub");
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const sec = valOf("--download-sections");
    const m = sec && String(sec).match(/^\\*([\\d.]+)-([\\d.]+)$/);
    if (m) {
      const r = require("node:child_process").spawnSync(
        path.join(__dirname, "ffmpeg"),
        ["-hide_banner", "-loglevel", "error", "-y", "-i", fixture,
         "-ss", m[1], "-to", m[2], "-c:v", "libx264", "-preset", "ultrafast",
         "-c:a", "aac", "-movflags", "+faststart", target],
        { encoding: "utf8" },
      );
      if (r.status !== 0) process.stderr.write("stub ffmpeg: " + (r.stderr || "") + "\\n");
    } else {
      fs.copyFileSync(fixture, target);
    }
  } catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
}
main().catch((e) => { process.stderr.write(String(e) + "\\n"); process.exit(1); });
`;

const binPath = path.join(root, "resources", "bin", "yt-dlp");
fs.writeFileSync(binPath, stub);
fs.chmodSync(binPath, 0o755);
fs.writeFileSync(path.join(root, "stub.json"), JSON.stringify(DEFAULTS, null, 2));
console.log(root);
