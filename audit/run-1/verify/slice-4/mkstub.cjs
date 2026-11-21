#!/usr/bin/env node
/**
 * slice-4 verification scaffolding. My own scriptable yt-dlp stub, written
 * from the harness README's contract rather than copied from another helper's
 * area, plus two things I need that the harness stub does not do:
 *
 *   - every invocation's argv is appended to <root>/calls.log  (A-5 counting)
 *   - the auth probe, the metadata probe, the download stage and the channel
 *     exporter's four call shapes can each be scripted independently, and the
 *     auth probe can answer differently per --cookies-from-browser value
 *
 * ffmpeg and deno are symlinked to the real binaries so cutting stays genuine.
 *
 * usage: node mkstub.cjs <rootDir>
 */
const fs = require("node:fs");
const path = require("node:path");

const REPO = "/home/user/stream-trimmer";

const DEFAULT_CFG = {
  version: "2099.12.31",
  // Auth probe (--simulate --verbose). `browser` keys by the
  // --cookies-from-browser value; `app` is a --cookies <file> run; `default`
  // covers anything unmatched.
  auth: {
    default: { exitCode: 0, stdout: "[download] 100% of 1.00MiB", stderr: "" },
  },
  // Metadata probe (-J / --dump-single-json) for /api/info.
  meta: { exitCode: 0, stderr: "", delayMs: 0 },
  info: {
    id: "stub0000001",
    title: "Stub video",
    duration: 3600,
    uploader: "Stub channel",
  },
  // Download stage.
  download: { exitCode: 0, stderr: "", delayMs: 0, progress: [0, 50, 100], writeMedia: true },
  // Channel exporter.
  channel: {
    name: "Stub Channel",
    subs: 4242,
    videos: 4,
    commentsPerVideo: 1,
    captionLines: 1,
    delayMs: 0,
    listDelayMs: 0,
  },
};

const STUB = String.raw`#!/usr/bin/env node
/* slice-4 scriptable yt-dlp. Behaviour from <root>/stub.json. */
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const read = () => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "stub.json"), "utf8")); }
  catch { return {}; }
};
const cfg = read();
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const urlArg = argv.find((a) => /^https?:\/\//.test(a)) || "";

try {
  fs.appendFileSync(
    path.join(ROOT, "calls.log"),
    JSON.stringify({ t: Date.now(), pid: process.pid, argv }) + "\n",
  );
} catch { /* ignore */ }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function emit(spec) {
  if (spec && spec.stdout) process.stdout.write(spec.stdout + "\n");
  if (spec && spec.stderr) process.stderr.write(spec.stderr + "\n");
  if (spec && spec.exitCode) process.exit(spec.exitCode);
}

function authSpec() {
  const a = cfg.auth || {};
  const browser = valOf("--cookies-from-browser");
  if (browser && a.browser && a.browser[browser]) return a.browser[browser];
  if (browser && a.browserDefault) return a.browserDefault;
  if (!browser && has("--cookies") && a.app) return a.app;
  return a.default || { exitCode: 0, stdout: "", stderr: "" };
}

async function main() {
  if (has("--version")) { process.stdout.write((cfg.version || "2099.12.31") + "\n"); return; }

  const dumpJson = has("-J") || has("--dump-json") || has("--dump-single-json");

  /* ---------- channel exporter ---------- */
  const ch = cfg.channel || {};
  if (dumpJson && has("--flat-playlist")) {
    if (ch.listDelayMs) await sleep(ch.listDelayMs);
    if (ch.listExitCode) { if (ch.listStderr) process.stderr.write(ch.listStderr + "\n"); process.exit(ch.listExitCode); }
    const shorts = /\/shorts/.test(urlArg);
    const n = Number(ch.videos || 0);
    const entries = [];
    for (let i = 0; i < n; i++) {
      entries.push({
        _type: "url", id: (shorts ? "sht" : "vid") + String(i).padStart(7, "0"),
        title: (shorts ? "Short " : "Video ") + i, url: "https://www.youtube.com/watch?v=x" + i,
        duration: shorts ? 30 : 600, view_count: 1000 - i * 10,
      });
    }
    process.stdout.write(JSON.stringify({
      _type: "playlist", id: "UCstub", title: ch.name || "Stub Channel",
      channel: ch.name || "Stub Channel", uploader: ch.name || "Stub Channel",
      channel_follower_count: ch.subs ?? 0, entries,
    }) + "\n");
    return;
  }

  // Transcript fetch (exporter and anything else that writes subs).
  if (has("--write-auto-subs") || has("--write-subs")) {
    if (ch.delayMs) await sleep(ch.delayMs);
    const out = valOf("-o") || valOf("--output");
    const lines = Number(ch.captionLines || 0);
    if (out && lines > 0) {
      let vtt = "WEBVTT\n\n";
      for (let i = 0; i < lines; i++) {
        const s = String(i).padStart(2, "0");
        vtt += "00:00:" + s + ".000 --> 00:00:" + String(i + 1).padStart(2, "0") + ".000\n";
        vtt += (ch.captionText || "caption line " + i) + "\n\n";
      }
      try { fs.writeFileSync(out + ".en.vtt", vtt); } catch { /* ignore */ }
    }
    return;
  }

  // Per-video metadata / comments for the exporter: a watch URL with
  // --skip-download. /api/info's probe has no --skip-download.
  if (dumpJson && has("--skip-download")) {
    if (ch.delayMs) await sleep(ch.delayMs);
    const id = (urlArg.split("v=")[1] || "vid0000000").split("&")[0];
    const body = {
      id, title: "Video " + id, channel: ch.name || "Stub Channel",
      uploader: ch.name || "Stub Channel", duration: 600, view_count: 1234,
      like_count: 12, comment_count: 3, upload_date: "20240101",
      description: "desc", tags: ["a", "b"], webpage_url: urlArg,
      channel_follower_count: ch.subs ?? 0,
    };
    if (has("--write-comments")) {
      const comments = [];
      for (let i = 0; i < Number(ch.commentsPerVideo || 0); i++) {
        comments.push({
          id: "c" + i, parent: "root", author: "A", author_id: "UC1",
          text: ch.commentText || "hello", like_count: 1,
          is_favorited: false, author_is_uploader: false, timestamp: 0,
        });
      }
      body.comments = comments;
    }
    process.stdout.write(JSON.stringify(body) + "\n");
    return;
  }

  /* ---------- auth probe: --simulate --verbose ---------- */
  if (has("--simulate")) {
    const spec = authSpec();
    if (spec.delayMs) await sleep(spec.delayMs);
    emit(spec);
    return;
  }

  /* ---------- /api/info metadata probe ---------- */
  if (dumpJson) {
    const m = cfg.meta || {};
    if (m.delayMs) await sleep(m.delayMs);
    if (m.exitCode) { if (m.stderr) process.stderr.write(m.stderr + "\n"); process.exit(m.exitCode); }
    const i = cfg.info || {};
    process.stdout.write(JSON.stringify(Object.assign({
      _type: "video", webpage_url: "https://www.youtube.com/watch?v=" + (i.id || "stub0000001"),
      formats: [
        { format_id: "18", ext: "mp4", height: 360, vcodec: "avc1", acodec: "mp4a" },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" },
        { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a" },
      ],
      subtitles: {}, automatic_captions: {}, comments: [],
    }, i)) + "\n");
    return;
  }

  /* ---------- download ---------- */
  const d = cfg.download || {};
  if (d.delayMs) await sleep(d.delayMs);
  if (d.exitCode) { if (d.stderr) process.stderr.write(d.stderr + "\n"); process.exit(d.exitCode); }
  for (const p of d.progress || []) {
    process.stdout.write("[download]  " + p + ".0% of 10.00MiB at 1.00MiB/s ETA 00:01\n");
    await sleep(20);
  }
  if (d.writeMedia !== false) {
    const out = valOf("-o") || valOf("--output");
    const fixture = path.join(ROOT, "fixture.mp4");
    if (out && fs.existsSync(fixture)) {
      const target = out.replace(/%\(.*?\)s/g, "stub");
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(fixture, target);
      } catch (e) { process.stderr.write("stub: " + e.message + "\n"); }
    }
  }
}
main().catch((e) => { process.stderr.write(String(e) + "\n"); process.exit(1); });
`;

function makeStub(root, cfg) {
  const bin = path.join(root, "resources", "bin");
  fs.mkdirSync(bin, { recursive: true });
  for (const name of ["ffmpeg", "deno"]) {
    const real = path.join(REPO, "resources", "bin", name);
    const link = path.join(bin, name);
    if (fs.existsSync(real) && !fs.existsSync(link)) fs.symlinkSync(real, link);
  }
  const fixture = path.join(root, "fixture.mp4");
  if (!fs.existsSync(fixture)) {
    fs.copyFileSync(path.join(REPO, "audit", "fixtures", "fixture.mp4"), fixture);
  }
  const p = path.join(bin, "yt-dlp");
  fs.writeFileSync(p, STUB);
  fs.chmodSync(p, 0o755);
  writeCfg(root, cfg || {});
  try { fs.unlinkSync(path.join(root, "calls.log")); } catch { /* ignore */ }
  return root;
}

/** Deep-ish merge onto the defaults and write stub.json. */
function writeCfg(root, cfg) {
  const out = JSON.parse(JSON.stringify(DEFAULT_CFG));
  for (const [k, v] of Object.entries(cfg || {})) {
    if (v && typeof v === "object" && !Array.isArray(v) && out[k] && typeof out[k] === "object") {
      Object.assign(out[k], v);
    } else {
      out[k] = v;
    }
  }
  fs.writeFileSync(path.join(root, "stub.json"), JSON.stringify(out, null, 2));
  return out;
}

function calls(root) {
  try {
    return fs
      .readFileSync(path.join(root, "calls.log"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

function resetCalls(root) {
  try { fs.unlinkSync(path.join(root, "calls.log")); } catch { /* ignore */ }
}

module.exports = { makeStub, writeCfg, calls, resetCalls, DEFAULT_CFG };

if (require.main === module) {
  const root = path.resolve(process.argv[2] || "");
  if (!root) { console.error("usage: mkstub.cjs <rootDir>"); process.exit(2); }
  makeStub(root, {});
  console.log(root);
}
