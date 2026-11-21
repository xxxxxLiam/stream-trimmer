#!/usr/bin/env node
/**
 * Audit run 2, area AF scaffolding. NOT product code.
 *
 * My own scriptable yt-dlp. Differences from audit/harness/make-stub-root.cjs,
 * which I need because A and F both have to fail one stage at a time:
 *   - `--version` ALWAYS succeeds, whatever else is scripted (otherwise
 *     resolveYtDlp() falls through to a real yt-dlp on PATH and reaches the
 *     network).
 *   - three independent stages: `auth` (the --simulate --verbose probe),
 *     `info` (-J metadata pre-flight) and `download`.
 *   - `auth.perSource` lets each --cookies-from-browser value answer
 *     differently in one run, so a sweep can be scripted browser by browser.
 *   - every invocation's literal argv is appended to <root>/calls.log, so
 *     process counts and --cookies provenance are measured, not argued.
 *
 * usage: node mkstub.cjs <rootDir>
 */
const fs = require("node:fs");
const path = require("node:path");

const REPO = "/home/user/stream-trimmer";
const root = path.resolve(process.argv[2] || "");
if (!root || root === REPO) {
  console.error("usage: mkstub.cjs <rootDir>   (never the repo: it would overwrite resources/bin/yt-dlp)");
  process.exit(2);
}

const bin = path.join(root, "resources", "bin");
fs.mkdirSync(bin, { recursive: true });
for (const name of ["ffmpeg", "deno"]) {
  const real = path.join(REPO, "resources", "bin", name);
  const link = path.join(bin, name);
  if (fs.existsSync(real) && !fs.existsSync(link)) fs.symlinkSync(real, link);
}
const fixture = path.join(REPO, "audit", "fixtures", "fixture.mp4");
if (fs.existsSync(fixture)) fs.copyFileSync(fixture, path.join(root, "fixture.mp4"));

const DEFAULTS = {
  info: {
    id: "stub0000001",
    title: "Stub video",
    duration: 3600,
    uploader: "Stub channel",
  },
  /** auth probe: status comes from the text, so give real yt-dlp strings. */
  auth: { exitCode: 0, stderr: "", stdout: "", delayMs: 0, perSource: {} },
  infoStage: { exitCode: 0, stderr: "", delayMs: 0 },
  downloadStage: { exitCode: 0, stderr: "", delayMs: 0, writeMedia: true },
  progress: [0, 50, 100],
};

const stubJson = path.join(root, "stub.json");
if (!fs.existsSync(stubJson)) fs.writeFileSync(stubJson, JSON.stringify(DEFAULTS, null, 2));

const stub = `#!/usr/bin/env node
// Audit stub yt-dlp (run 2, area AF). Config: <root>/stub.json
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const DEFAULTS = ${JSON.stringify(DEFAULTS)};
function cfg() {
  try { return Object.assign({}, DEFAULTS, JSON.parse(fs.readFileSync(path.join(ROOT, "stub.json"), "utf8"))); }
  catch { return DEFAULTS; }
}
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
try {
  fs.appendFileSync(path.join(ROOT, "calls.log"), JSON.stringify({ t: Date.now(), pid: process.pid, argv }) + "\\n");
} catch {}

async function sleep(ms) { if (ms) await new Promise((r) => setTimeout(r, ms)); }

async function main() {
  const c = cfg();
  // --version must never fail: the server picks the newest of bundled/system.
  if (has("--version")) { process.stdout.write("2099.12.31\\n"); return; }

  if (has("--simulate")) {
    const a = c.auth || {};
    const src = valOf("--cookies-from-browser");
    const per = (a.perSource || {})[src || (valOf("--cookies") ? "app" : "none")];
    const use = per ? Object.assign({}, a, per) : a;
    await sleep(use.delayMs);
    if (use.stdout) process.stdout.write(String(use.stdout) + "\\n");
    if (use.stderr) process.stderr.write(String(use.stderr) + "\\n");
    process.exit(use.exitCode || 0);
  }

  if (has("-J") || has("--dump-json") || has("--dump-single-json")) {
    const s = c.infoStage || {};
    await sleep(s.delayMs);
    if (s.exitCode) {
      if (s.stderr) process.stderr.write(String(s.stderr) + "\\n");
      process.exit(s.exitCode);
    }
    const info = Object.assign({
      _type: "video",
      webpage_url: "https://www.youtube.com/watch?v=" + c.info.id,
      formats: [
        { format_id: "18", ext: "mp4", height: 360, vcodec: "avc1", acodec: "mp4a" },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" },
        { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a" },
      ],
      subtitles: {}, automatic_captions: {}, comments: [],
    }, c.info);
    process.stdout.write(JSON.stringify(info) + "\\n");
    return;
  }

  const d = c.downloadStage || {};
  await sleep(d.delayMs);
  if (d.exitCode) {
    if (d.stderr) process.stderr.write(String(d.stderr) + "\\n");
    process.exit(d.exitCode);
  }
  for (const p of c.progress || []) {
    process.stdout.write("[download]  " + p + ".0% of 10.00MiB at 1.00MiB/s ETA 00:01\\n");
    await sleep(20);
  }
  if (d.writeMedia !== false) {
    const out = valOf("-o") || valOf("--output");
    const fx = path.join(ROOT, "fixture.mp4");
    if (out && fs.existsSync(fx)) {
      const target = out.replace(/%\\(.*?\\)s/g, "stub");
      try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(fx, target); }
      catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
    }
  }
}
main().catch((e) => { process.stderr.write(String(e) + "\\n"); process.exit(1); });
`;

const stubPath = path.join(bin, "yt-dlp");
fs.writeFileSync(stubPath, stub);
fs.chmodSync(stubPath, 0o755);
console.log(root);
