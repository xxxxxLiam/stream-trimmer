#!/usr/bin/env node
/**
 * audit/run-2/area-E/stub.cjs <rootDir>
 *
 * Run-2 area-E scaffolding. Builds a throwaway root with a scriptable fake
 * yt-dlp that covers everything the CHANNEL exporter calls, written from
 * scratch for this run (not the run-1 author's script, not a patch of the
 * shared harness stub):
 *
 *   --flat-playlist          -> a channel listing with N entries, per tab
 *   --write-comments         -> metadata + a comments array
 *   --dump-single-json       -> plain metadata
 *   --write-auto-subs/-subs  -> writes <output>.en.vtt
 *   --version                -> 2099.12.31 (so a real yt-dlp on PATH never wins)
 *
 * Every invocation appends one JSON line to <root>/argv.log, so what the child
 * was actually handed is measured, not argued.
 *
 * Behaviour comes from <root>/stub.json, rewritable between calls:
 *   videos        how many entries the listing reports
 *   commentTexts  the comment bodies given for every video
 *   vttText       the raw VTT written for every video
 *   channelName   info.channel for the listing
 *   delayMs       flat delay on every call
 *   listDelayMs / metaDelayMs / commentDelayMs / subDelayMs  per-stage delays
 *   exitCode / stderr                                       hard failure
 *   failStage     "list" | "meta" | "comments" | "subs" — fail only that stage
 *
 * ffmpeg and deno are symlinked to the real binaries.
 */
const fs = require("node:fs");
const path = require("node:path");

const REPO = "/home/user/stream-trimmer";
const root = path.resolve(process.argv[2] || "");
if (!root) {
  console.error("usage: stub.cjs <rootDir>");
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
  channelName: "Stub Channel",
  videos: 6,
  subs: 4242,
  commentTexts: ["hello"],
  vttText:
    "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nline one\n\n00:00:02.000 --> 00:00:04.000\nline two\n",
  delayMs: 0,
  listDelayMs: 0,
  metaDelayMs: 0,
  commentDelayMs: 0,
  subDelayMs: 0,
  exitCode: 0,
  stderr: "",
  failStage: "",
};
const stubJson = path.join(root, "stub.json");
if (!fs.existsSync(stubJson)) fs.writeFileSync(stubJson, JSON.stringify(DEFAULTS, null, 2));

const stub = `#!/usr/bin/env node
// run-2 area-E fake yt-dlp. Instructions: <root>/stub.json
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const D = ${JSON.stringify(DEFAULTS)};
function cfg() {
  try { return Object.assign({}, D, JSON.parse(fs.readFileSync(path.join(ROOT, "stub.json"), "utf8"))); }
  catch { return D; }
}
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(stage) {
  try {
    fs.appendFileSync(path.join(ROOT, "argv.log"),
      JSON.stringify({ t: Date.now(), pid: process.pid, stage, argv }) + "\\n");
  } catch { /* ignore */ }
}

function vidId(n) { return "vid" + String(n).padStart(7, "0"); }

async function main() {
  const c = cfg();
  if (has("--version")) { log("version"); process.stdout.write("2099.12.31\\n"); return; }

  const isList = has("--flat-playlist");
  const isComments = has("--write-comments");
  const isSubs = has("--write-auto-subs") || has("--write-subs");
  const stage = isList ? "list" : isSubs ? "subs" : isComments ? "comments" : "meta";
  log(stage);

  if (c.delayMs) await sleep(c.delayMs);
  const perStage = { list: c.listDelayMs, meta: c.metaDelayMs, comments: c.commentDelayMs, subs: c.subDelayMs }[stage];
  if (perStage) await sleep(perStage);

  if (c.exitCode || c.failStage === stage) {
    if (c.stderr) process.stderr.write(String(c.stderr) + "\\n");
    process.exit(c.exitCode || 1);
  }

  if (isSubs) {
    const out = valOf("--output") || valOf("-o");
    if (out && c.vttText) {
      try {
        fs.mkdirSync(path.dirname(out), { recursive: true });
        fs.writeFileSync(out + ".en.vtt", c.vttText);
      } catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
    }
    return;
  }

  if (isList) {
    const url = argv[0] || "";
    const shorts = /\\/shorts/.test(url);
    const n = Number(c.videos) || 0;
    const entries = [];
    for (let i = 0; i < n; i++) {
      entries.push({
        id: vidId(shorts ? 1000 + i : i),
        title: (shorts ? "Short " : "Video ") + i,
        duration: shorts ? 30 : 600,
        view_count: 1000 - i,
        url: "https://www.youtube.com/watch?v=" + vidId(shorts ? 1000 + i : i),
      });
    }
    process.stdout.write(JSON.stringify({
      _type: "playlist",
      channel: c.channelName,
      uploader: c.channelName,
      title: c.channelName,
      channel_follower_count: Number(c.subs) || 0,
      entries,
    }) + "\\n");
    return;
  }

  // single-video metadata (with or without comments)
  const url = argv[0] || "";
  const m = /[?&]v=([^&]+)/.exec(url);
  const id = m ? m[1] : "vid0000000";
  const short = /^vid00010/.test(id);
  const info = {
    _type: "video",
    id,
    webpage_url: url,
    title: "Title " + id,
    description: "Desc " + id + " #tagone",
    upload_date: "20250101",
    duration: short ? 30 : 600,
    view_count: 500,
    like_count: 7,
    comment_count: (c.commentTexts || []).length,
    channel: c.channelName,
    thumbnail: "https://i.ytimg.com/vi/" + id + "/hq.jpg",
    tags: ["alpha", "beta"],
    hashtags: ["tagone"],
    subtitles: {}, automatic_captions: {},
  };
  if (isComments) {
    info.comments = (c.commentTexts || []).map((text, i) => ({
      id: "c" + i,
      text,
      author: "A" + i,
      author_id: "UC" + i,
      like_count: 1,
      is_pinned: false,
      author_is_uploader: false,
      time_text: "1 day ago",
      timestamp: 0,
    }));
  }
  process.stdout.write(JSON.stringify(info) + "\\n");
}
main().catch((e) => { process.stderr.write(String(e) + "\\n"); process.exit(1); });
`;

const stubPath = path.join(bin, "yt-dlp");
fs.writeFileSync(stubPath, stub);
fs.chmodSync(stubPath, 0o755);
console.log(root);
