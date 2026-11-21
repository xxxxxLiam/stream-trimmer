#!/usr/bin/env node
/**
 * v-stub.cjs — slice-3 verification stub root builder.
 *
 * Written from scratch for the verification pass. It starts from the SHARED
 * harness (audit/harness/make-stub-root.cjs) so ffmpeg/deno stay real, then
 * replaces resources/bin/yt-dlp with my own fake that adds three observation
 * points the shared stub does not have:
 *
 *   1. argv.log      — one JSON line per invocation: { t, argv, cwd }.
 *                      This is how I see the literal --cookies value the
 *                      child process receives, rather than inferring it.
 *   2. cookieWriteBack — real yt-dlp rewrites whatever file it was handed as
 *                      --cookies when it closes (YoutubeDL.save_cookies from
 *                      close()). The shared stub writes nothing back, so the
 *                      hazard cookieJar.ts exists for cannot be observed.
 *                      When set, the stub writes this text to the path it was
 *                      given.
 *   3. per-stage failure — failVersion / failInfo / failDownload, so I can
 *                      fail ONE stage. The shared stub's `exitCode` fails the
 *                      --version probe too, which makes resolveYtDlp() prefer
 *                      a system yt-dlp and reach the real network.
 *
 * Usage: node v-stub.cjs <rootDir>
 * Config: <rootDir>/stub.json  (rewritable between calls, no relaunch)
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const root = path.resolve(process.argv[2] || "");
if (!root) {
  console.error("usage: v-stub.cjs <rootDir>");
  process.exit(2);
}
const REPO = path.resolve(__dirname, "..", "..", "..", "..");

// Start from the shared harness so ffmpeg/deno symlinks are made the same way.
execFileSync(process.execPath, [path.join(REPO, "audit", "harness", "make-stub-root.cjs"), root], {
  stdio: "inherit",
});
// The fixture the stub places as "downloaded" media.
const fixture = path.join(REPO, "audit", "fixtures", "fixture.mp4");
if (fs.existsSync(fixture) && !fs.existsSync(path.join(root, "fixture.mp4"))) {
  fs.copyFileSync(fixture, path.join(root, "fixture.mp4"));
}

const DEFAULTS = {
  info: { id: "stub0000001", title: "Stub video", duration: 3600, uploader: "Stub channel" },
  delayMs: 0,
  infoDelayMs: null,
  downloadDelayMs: null,
  progress: [0, 50, 100],
  writeMedia: true,
  // per-stage failure
  failVersion: null, // { exitCode, stderr }
  failInfo: null,
  failDownload: null,
  failAuth: null,
  // what to write back over whatever --cookies path we were handed
  cookieWriteBack: null, // string
  cookieWriteDelayMs: 0,
  // channel exporter scripting
  channel: null, // { entries:[{id,title,...}], comments:[...], captions:"<vtt>" }
};

const stubJson = path.join(root, "stub.json");
fs.writeFileSync(stubJson, JSON.stringify(DEFAULTS, null, 2));

const stub = `#!/usr/bin/env node
// slice-3 verification fake yt-dlp. Behaviour from ../../stub.json.
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "..", "..");
const cfg = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "stub.json"), "utf8")); }
  catch { return ${JSON.stringify(DEFAULTS)}; }
})();
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const valOf = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

// Observation point 1: the exact argv this child received.
try {
  fs.appendFileSync(path.join(ROOT, "argv.log"),
    JSON.stringify({ t: Date.now(), pid: process.pid, argv, cwd: process.cwd() }) + "\\n");
} catch {}

function die(spec) {
  if (spec && spec.stderr) process.stderr.write(String(spec.stderr) + "\\n");
  process.exit((spec && spec.exitCode) || 1);
}

// Observation point 2: write back over the jar we were handed, as real yt-dlp does.
async function writeBackCookies() {
  if (cfg.cookieWriteBack == null) return;
  const jar = valOf("--cookies");
  if (!jar) return;
  const text = String(cfg.cookieWriteBack);
  try {
    if (cfg.cookieWriteDelayMs) {
      const half = Math.floor(text.length / 2);
      fs.writeFileSync(jar, text.slice(0, half));
      await new Promise((r) => setTimeout(r, cfg.cookieWriteDelayMs));
      fs.appendFileSync(jar, text.slice(half));
    } else {
      fs.writeFileSync(jar, text);
    }
    fs.appendFileSync(path.join(ROOT, "writeback.log"),
      JSON.stringify({ t: Date.now(), jar, bytes: text.length }) + "\\n");
  } catch (e) {
    process.stderr.write("stub writeback: " + e.message + "\\n");
  }
}

async function main() {
  if (has("--version")) {
    if (cfg.failVersion) return die(cfg.failVersion);
    // Far-future on purpose: the server prefers the newer of bundled/system
    // yt-dlp, and a real one on PATH would otherwise win and hit the network.
    process.stdout.write("2099.12.31\\n");
    return;
  }
  const isInfo = has("-J") || has("--dump-json") || has("--dump-single-json");
  // delayMs stalls every stage; infoDelayMs / downloadDelayMs stall one, so a
  // cancel test can keep a section-download child alive without also stalling
  // the metadata probe that must finish before it starts.
  const stall = isInfo
    ? (cfg.infoDelayMs != null ? cfg.infoDelayMs : (cfg.delayMs || 0))
    : (cfg.downloadDelayMs != null ? cfg.downloadDelayMs : (cfg.delayMs || 0));
  if (stall) await new Promise((r) => setTimeout(r, stall));

  if (isInfo) {
    if (cfg.failInfo) { await writeBackCookies(); return die(cfg.failInfo); }
    const ch = cfg.channel;
    // Channel exporter asks for a flat playlist of entries.
    if (ch && (has("--flat-playlist") || /(channel|\\/@|playlist)/.test(argv[0] || ""))) {
      const entries = (ch.entries || []).map((e, i) => Object.assign({
        _type: "url", id: e.id || ("vid" + i), title: e.title || ("Video " + i),
        url: "https://www.youtube.com/watch?v=" + (e.id || ("vid" + i)),
        duration: e.duration == null ? 120 : e.duration,
        view_count: e.view_count == null ? 10 : e.view_count,
      }, e));
      const out = {
        _type: "playlist", id: ch.id || "UCstub", title: ch.title || "Stub Channel",
        channel: ch.title || "Stub Channel", uploader: ch.title || "Stub Channel",
        channel_id: ch.id || "UCstub", entries,
      };
      process.stdout.write(JSON.stringify(out) + "\\n");
      await writeBackCookies();
      return;
    }
    const vid = (argv[0] || "").match(/v=([A-Za-z0-9_-]+)/);
    const base = {
      _type: "video",
      id: (vid && vid[1]) || cfg.info.id,
      webpage_url: "https://www.youtube.com/watch?v=" + ((vid && vid[1]) || cfg.info.id),
      formats: [
        { format_id: "18",  ext: "mp4", height: 360,  vcodec: "avc1", acodec: "mp4a" },
        { format_id: "137", ext: "mp4", height: 1080, vcodec: "avc1", acodec: "none" },
        { format_id: "140", ext: "m4a", height: null, vcodec: "none", acodec: "mp4a" },
      ],
      subtitles: {}, automatic_captions: {},
      comments: (ch && ch.comments) || [],
      comment_count: ((ch && ch.comments) || []).length,
    };
    const info = Object.assign(base, cfg.info, vid ? { id: vid[1] } : {});
    if (ch && ch.videoOverrides && ch.videoOverrides[info.id]) {
      Object.assign(info, ch.videoOverrides[info.id]);
    }
    process.stdout.write(JSON.stringify(info) + "\\n");
    await writeBackCookies();
    return;
  }

  // Subtitle fetch (--write-auto-subs / --write-subs with --skip-download)
  if (has("--skip-download") && (has("--write-auto-subs") || has("--write-subs") ||
      has("--write-auto-sub") || has("--write-sub"))) {
    if (cfg.failDownload) { await writeBackCookies(); return die(cfg.failDownload); }
    const out = valOf("-o") || valOf("--output");
    const vtt = (cfg.channel && cfg.channel.captions) ||
      "WEBVTT\\n\\n00:00:00.000 --> 00:00:02.000\\nstub caption line\\n";
    if (out) {
      try {
        const target = String(out).replace(/%\\(.*?\\)s/g, "stub");
        const base = target.replace(/\\.[a-z0-9]+$/i, "");
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(base + ".en.vtt", vtt);
      } catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
    }
    await writeBackCookies();
    return;
  }

  // --simulate probes (auth status). Imitates real yt-dlp -v, which prints
  // "Found YouTube account cookies" only when the jar it was handed actually
  // carries an auth cookie — so the verdict tracks the file on disk.
  if (has("--simulate")) {
    // The auth probe gets its OWN failure switch. Failing it from the generic
    // download switch would sign the app out mid-test and put the sign-in
    // modal back over the workspace, which has nothing to do with the finding
    // under test.
    if (cfg.failAuth) { await writeBackCookies(); return die(cfg.failAuth); }
    const jar = valOf("--cookies");
    let signedIn = false;
    if (jar) {
      try {
        const text = fs.readFileSync(jar, "utf8");
        for (const raw of text.split(/\\r?\\n/)) {
          const line = raw.trim().replace(/^#HttpOnly_/, "");
          if (!line || line.startsWith("#")) continue;
          const cols = line.split("\\t");
          if (cols.length < 7) continue;
          if (!/(^|\\.)(youtube\\.com|google\\.com)$/i.test(cols[0])) continue;
          if (["SID", "__Secure-3PSID", "__Secure-1PSID"].includes(cols[5]) && cols[6]) {
            signedIn = true; break;
          }
        }
      } catch {}
    }
    if (signedIn) process.stderr.write("[debug] Found YouTube account cookies\\n");
    else process.stderr.write("[debug] no YouTube account cookies in the jar\\n");
    process.stdout.write("\\n");
    await writeBackCookies();
    return;
  }

  // Download.
  if (cfg.failDownload) { await writeBackCookies(); return die(cfg.failDownload); }
  for (const p of cfg.progress || []) {
    process.stdout.write("[download]  " + p + ".0% of 10.00MiB at 1.00MiB/s ETA 00:01\\n");
    await new Promise((r) => setTimeout(r, 30));
  }
  if (cfg.writeMedia) {
    const out = valOf("-o") || valOf("--output");
    const fixture = path.join(ROOT, "fixture.mp4");
    if (out && fs.existsSync(fixture)) {
      const target = String(out).replace(/%\\(.*?\\)s/g, "stub");
      try {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(fixture, target);
      } catch (e) { process.stderr.write("stub: " + e.message + "\\n"); }
    }
  }
  await writeBackCookies();
}
main().catch((e) => { process.stderr.write(String(e) + "\\n"); process.exit(1); });
`;

const stubPath = path.join(root, "resources", "bin", "yt-dlp");
fs.writeFileSync(stubPath, stub);
fs.chmodSync(stubPath, 0o755);
console.log(root);
