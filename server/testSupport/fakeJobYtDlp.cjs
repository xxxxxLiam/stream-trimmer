#!/usr/bin/env node
/**
 * File: fakeJobYtDlp.cjs
 * Path: server/testSupport/fakeJobYtDlp.cjs
 * Description: A scriptable stand-in for yt-dlp for the /api/download job
 * tests. Behaviour comes from the JSON file named by FAKE_JOB_CFG, re-read on
 * every call so a test can change it between requests:
 *   delayMs        sleep before a download finishes (cancel / race windows)
 *   probeDelayMs   sleep before the metadata probe answers
 *   duration       video length the probe reports
 *   failSections   fail --download-sections runs with a 403, which sends the
 *                  server down the whole-file + local-trim path
 *   corruptSource  write a truncated, unplayable file for source.* outputs
 *   failProbe      exit 1 with stderr on the metadata probe
 *   stderr         text for failProbe
 *   cookieWriteBack  text written to the --cookies file on exit, as real yt-dlp does
 * Every call appends {pid, argv} to FAKE_JOB_LOG; download runs also append
 * their pid to FAKE_JOB_LOG + ".pids". The "media" is audit/fixtures/fixture.mp4.
 */
const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
const cfg = (() => {
  try {
    return JSON.parse(fs.readFileSync(process.env.FAKE_JOB_CFG, "utf8"));
  } catch {
    return {};
  }
})();
const has = (f) => argv.includes(f);
const valOf = (f) => {
  const i = argv.indexOf(f);
  return i >= 0 ? argv[i + 1] : null;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  fs.appendFileSync(
    process.env.FAKE_JOB_LOG,
    JSON.stringify({ pid: process.pid, argv }) + "\n",
  );
} catch {}

process.on("exit", () => {
  const file = valOf("--cookies");
  if (cfg.cookieWriteBack && file) {
    try {
      fs.writeFileSync(file, String(cfg.cookieWriteBack));
    } catch {}
  }
});

async function main() {
  if (has("--version")) return void process.stdout.write("2099.12.31\n");

  const isProbe = has("-J") || has("--dump-json") || has("--dump-single-json");
  if (isProbe) {
    if (cfg.probeDelayMs) await sleep(cfg.probeDelayMs);
    if (cfg.failProbe) {
      process.stderr.write(String(cfg.stderr || "ERROR: probe failed") + "\n");
      process.exit(1);
    }
    process.stdout.write(
      JSON.stringify({
        id: "stub0000001",
        title: "Stub video",
        duration: cfg.duration || 3600,
        formats: [
          { format_id: "18", ext: "mp4", height: 360, vcodec: "avc1", acodec: "mp4a" },
        ],
        comments: [],
      }) + "\n",
    );
    return;
  }

  try {
    fs.appendFileSync(process.env.FAKE_JOB_LOG + ".pids", process.pid + "\n");
  } catch {}
  if (cfg.delayMs) await sleep(cfg.delayMs);
  if (has("--download-sections") && cfg.failSections) {
    process.stderr.write("ERROR: unable to download: HTTP Error 403: Forbidden\n");
    process.exit(1);
  }
  const out = valOf("--output") || valOf("-o");
  const fixture = process.env.FAKE_JOB_FIXTURE;
  if (out && fixture) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    if (cfg.corruptSource && path.basename(out).startsWith("source.")) {
      fs.writeFileSync(out, fs.readFileSync(fixture).subarray(0, 4000));
    } else {
      fs.copyFileSync(fixture, out);
    }
  }
}
main().catch((e) => {
  process.stderr.write(String(e) + "\n");
  process.exit(1);
});
