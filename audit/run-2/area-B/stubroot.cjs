#!/usr/bin/env node
/**
 * File: stubroot.cjs
 * Path: audit/run-2/area-B/stubroot.cjs
 * Description: Area-B stub root. Wraps audit/harness/make-stub-root.cjs and then
 *   replaces resources/bin/yt-dlp with a superset of the harness stub that also
 *   - answers the auth probe (--simulate --verbose) as signed in, so the
 *     connect modal (area A's hard gate) does not cover the clipping loop, and
 *   - writes a real WebVTT subtitle file for /api/transcript, with a
 *     configurable number of cues, so transcript windowing can be measured.
 *
 *   Run-2 addition: with "infoFromUrl": true the probe answers with the video id
 *   taken from the URL it was asked about, and a title from the "titles" map
 *   (default "Video <id>"). Without it every tab in a restored workspace gets the
 *   same metadata whatever its own link says, which fakes both a cross-tab leak and
 *   a failed restore. No product code is touched.
 *
 * Usage: node stubroot.cjs <rootDir>
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO = path.resolve(__dirname, "..", "..", "..");
const root = path.resolve(process.argv[2] || "");
if (!root) {
  console.error("usage: stubroot.cjs <rootDir>");
  process.exit(2);
}

execFileSync(
  process.execPath,
  [path.join(REPO, "audit", "harness", "make-stub-root.cjs"), root],
  { stdio: "inherit" },
);

// Real media for the cutting pipeline.
const fixture = path.join(REPO, "audit", "fixtures", "fixture.mp4");
fs.copyFileSync(fixture, path.join(root, "fixture.mp4"));

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
  // Area-B additions:
  transcriptLines: 60, // cues written into the .en.vtt
  transcriptCueSec: 4, // seconds per cue
  transcriptAvailable: true,
  signedIn: true,
  infoFromUrl: false,
  titles: {},
  durations: {},
  section403: false,
};

const stub = `#!/usr/bin/env node
// Area-B fake yt-dlp. Behaviour comes from ../../stub.json.
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
const log = (s) => { try { fs.appendFileSync(path.join(ROOT, "calls.log"), s + "\\n"); } catch {} };
log(JSON.stringify(argv));

function vtt(n, step) {
  const t = (s) => {
    const hh = String(Math.floor(s / 3600)).padStart(2, "0");
    const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
    const ss = String(Math.floor(s % 60)).padStart(2, "0");
    return hh + ":" + mm + ":" + ss + ".000";
  };
  const words = ["alpha","bravo","charlie","delta","echo","foxtrot","golf","hotel"];
  let out = "WEBVTT\\n\\n";
  for (let i = 0; i < n; i++) {
    const a = i * step;
    out += t(a) + " --> " + t(a + step) + "\\n";
    // line 7 carries a unique phrase for search tests; one phrase spans two lines.
    if (i === 7) out += "the needle in the haystack\\n\\n";
    else if (i === 20) out += "a phrase that wraps\\n\\n";
    else if (i === 21) out += "across two lines here\\n\\n";
    else out += "line " + i + " " + words[i % words.length] + " says something\\n\\n";
  }
  return out;
}

async function main() {
  if (has("--version")) { process.stdout.write("2099.12.31\\n"); return; }
  if (c.delayMs) await new Promise((r) => setTimeout(r, c.delayMs));

  // Auth probe: yt-dlp is run with --simulate --verbose. Answer before exitCode
  // so a scripted download failure does not also sign the user out.
  if (has("--simulate")) {
    if (c.signedIn === false) { process.stderr.write("ERROR: Sign in to confirm your age\\n"); process.exit(1); }
    process.stderr.write("[debug] Found YouTube account cookies\\n");
    return;
  }

  if (c.exitCode) {
    if (c.stderr) process.stderr.write(c.stderr + "\\n");
    process.exit(c.exitCode);
  }

  if (has("-J") || has("--dump-json") || has("--dump-single-json")) {
    // Which video was this probe actually about? (run-2) The URL is the last bare
    // argument; pull the id out of it so each tab gets its own metadata.
    let askedId = null;
    if (c.infoFromUrl) {
      const urlArg = argv.filter((x) => /^https?:/.test(x)).pop() || "";
      const m = urlArg.match(/[?&]v=([\\w-]{5,})/) || urlArg.match(/\\/(?:shorts|embed|live|v)\\/([\\w-]{5,})/) || urlArg.match(/youtu\\.be\\/([\\w-]{5,})/);
      if (m) askedId = m[1];
    }
    const base = askedId
      ? Object.assign({}, c.info, { id: askedId, title: (c.titles || {})[askedId] || ("Video " + askedId), duration: (c.durations || {})[askedId] || c.info.duration })
      : c.info;
    const info = Object.assign({
      _type: "video",
      webpage_url: "https://www.youtube.com/watch?v=" + (askedId || c.info.id),
      formats: [
        { format_id: "18",  ext: "mp4", height: 360,  vcodec: "avc1", acodec: "mp4a" },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" },
        { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a" },
      ],
      subtitles: {}, automatic_captions: {}, comments: [],
    }, base);
    process.stdout.write(JSON.stringify(info) + "\\n");
    return;
  }

  // Subtitles-only run (/api/transcript): --skip-download with --write-*-subs.
  if (has("--skip-download") && (has("--write-auto-subs") || has("--write-subs"))) {
    if (c.transcriptAvailable === false) return;
    const out = valOf("-o") || valOf("--output");
    if (out) {
      const target = String(out).replace(/%\\(.*?\\)s/g, "stub") + ".en.vtt";
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, vtt(c.transcriptLines ?? 60, c.transcriptCueSec ?? 4));
    }
    return;
  }

  // (run-2) Make the SECTIONED attempt 403 so the server falls back to downloading the
  // whole media and trimming it locally — the path T1 changed for G-4 (pre-roll), which
  // the sectioned path never reaches.
  if (c.section403 && has("--download-sections")) {
    process.stderr.write("ERROR: unable to download video data: HTTP Error 403: Forbidden\\n");
    process.exit(1);
  }

  for (const p of c.progress || []) {
    process.stdout.write("[download]  " + p + ".0% of 10.00MiB at 1.00MiB/s ETA 00:01\\n");
    await new Promise((r) => setTimeout(r, 30));
  }
  if (c.writeMedia) {
    const out = valOf("-o") || valOf("--output");
    const fixture = path.join(ROOT, "fixture.mp4");
    if (out && fs.existsSync(fixture)) {
      const target = String(out).replace(/%\\(.*?\\)s/g, "stub");
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        // Real yt-dlp cuts the requested section. Emulate that with the real
        // ffmpeg so the server's concat step is exercised on honest input and
        // the finished clip's duration is a meaningful assertion.
        const sec = valOf("--download-sections");
        const m = sec && String(sec).match(/^\\*([\\d.]+)-([\\d.]+)$/);
        if (m) {
          const ff = path.join(__dirname, "ffmpeg");
          const args = [
            "-hide_banner", "-loglevel", "error", "-y",
            "-i", fixture,
            "-ss", m[1], "-to", m[2],
            "-c:v", "libx264", "-preset", "ultrafast",
            "-c:a", "aac", "-movflags", "+faststart",
            target,
          ];
          const r = require("node:child_process").spawnSync(ff, args, { encoding: "utf8" });
          if (r.status !== 0) process.stderr.write("stub ffmpeg: " + (r.stderr || "") + "\\n");
        } else {
          fs.copyFileSync(fixture, target);
        }
      } catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
    }
  }
}
main().catch((e) => { process.stderr.write(String(e) + "\\n"); process.exit(1); });
`;

const binPath = path.join(root, "resources", "bin", "yt-dlp");
fs.writeFileSync(binPath, stub);
fs.chmodSync(binPath, 0o755);
fs.writeFileSync(path.join(root, "stub.json"), JSON.stringify(DEFAULTS, null, 2));
console.log(root);
