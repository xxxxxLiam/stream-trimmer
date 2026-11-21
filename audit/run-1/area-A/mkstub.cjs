#!/usr/bin/env node
/**
 * Replaces /tmp/stub-A/resources/bin/yt-dlp with the harness stub PLUS:
 *   - an argv log (`calls.log`), so a flow's real yt-dlp cost can be counted;
 *   - per-source overrides, so an `--cookies <file>` probe (the imported
 *     session) can answer differently from a `--cookies-from-browser` probe
 *     (the automatic sweep) in the SAME run. stub.json may carry
 *     `app: {...}` and `browser: {...}` blocks that override the top level.
 * Audit scaffolding only; no product code is touched.
 */
const fs = require("node:fs");
const path = require("node:path");
const ROOT = "/tmp/stub-A";
const bin = path.join(ROOT, "resources", "bin", "yt-dlp");

const src = `#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
let cfg = {};
try { cfg = JSON.parse(fs.readFileSync(path.join(ROOT, "stub.json"), "utf8")); } catch {}
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const mode = has("--cookies") ? "app" : has("--cookies-from-browser") ? "browser" : "none";
if (cfg[mode]) cfg = Object.assign({}, cfg, cfg[mode]);
try {
  fs.appendFileSync(path.join(ROOT, "calls.log"), JSON.stringify({ t: Date.now(), mode, argv }) + "\\n");
} catch {}
async function main() {
  if (has("--version")) { process.stdout.write("2099.12.31\\n"); return; }
  if (cfg.delayMs) await new Promise((r) => setTimeout(r, cfg.delayMs));
  if (cfg.exitCode) {
    if (cfg.stderr) process.stderr.write(cfg.stderr + "\\n");
    process.exit(cfg.exitCode);
  }
  if (has("-J") || has("--dump-json") || has("--dump-single-json")) {
    const info = Object.assign({
      _type: "video",
      webpage_url: "https://www.youtube.com/watch?v=" + (cfg.info && cfg.info.id),
      formats: [
        { format_id: "18", ext: "mp4", height: 360, vcodec: "avc1", acodec: "mp4a" },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" },
        { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a" },
      ],
      subtitles: {}, automatic_captions: {}, comments: [],
    }, cfg.info || {});
    process.stdout.write(JSON.stringify(info) + "\\n");
    return;
  }
  if (cfg.stdout) process.stdout.write(cfg.stdout + "\\n");
  if (cfg.stderr) process.stderr.write(cfg.stderr + "\\n");
  for (const p of cfg.progress || []) {
    process.stdout.write("[download]  " + p + ".0% of 10.00MiB at 1.00MiB/s ETA 00:01\\n");
    await new Promise((r) => setTimeout(r, 10));
  }
  if (cfg.writeMedia) {
    const out = valOf("-o") || valOf("--output");
    const fixture = path.join(ROOT, "fixture.mp4");
    if (out && fs.existsSync(fixture)) {
      const target = out.replace(/%\\(.*?\\)s/g, "stub");
      try { fs.mkdirSync(path.dirname(target), { recursive: true }); fs.copyFileSync(fixture, target); }
      catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
    }
  }
}
main().catch((e) => { process.stderr.write(String(e) + "\\n"); process.exit(1); });
`;
fs.writeFileSync(bin, src);
fs.chmodSync(bin, 0o755);
console.log("wrote", bin);
