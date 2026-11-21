#!/usr/bin/env node
/**
 * File: gfake.cjs
 * Path: audit/run-2/area-G/gfake.cjs
 * Description: Run-2 area-G stand-in for yt-dlp. Behaviour is re-read from the
 * JSON file named by G_FAKE_CFG on every call, so a script can change it
 * between requests without restarting the server.
 *
 *   delayMs            sleep before a download run finishes (cancel windows)
 *   probeDelayMs       sleep before the metadata probe answers
 *   duration           duration the probe reports
 *   heights            heights the probe lists (default [360])
 *   failProbe/stderr   make the metadata probe exit 1
 *   failSections       --download-sections runs 403, so the server takes the
 *                      whole-file + local-trim path
 *   failFull           the whole-file run fails
 *   corruptSource      write a truncated, unplayable source.*
 *   noOutput           write nothing at all
 *   authOutput         what a --simulate (auth probe) run prints
 *   authDelayMs        sleep in a --simulate run
 *   cookieWriteBack    text written back to the --cookies file on exit, which
 *                      is what real yt-dlp does on EVERY run (save_cookies)
 *   cookieWriteDelayMs write it in two halves around a pause
 *   touchFile          a path to create (a canary for shell injection)
 *
 * Every invocation appends {pid, ppid, argv, cwd} to G_FAKE_LOG; download runs
 * also append {pid, kind} to G_FAKE_LOG + ".pids".
 */
const fs = require("node:fs");
const path = require("node:path");

const argv = process.argv.slice(2);
const cfg = (() => {
  try {
    return JSON.parse(fs.readFileSync(process.env.G_FAKE_CFG, "utf8"));
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
    process.env.G_FAKE_LOG,
    JSON.stringify({
      pid: process.pid,
      ppid: process.ppid,
      at: Date.now(),
      argv,
      cwd: process.cwd(),
    }) + "\n",
  );
} catch {
  /* ignore */
}

function markPid(kind) {
  try {
    fs.appendFileSync(
      `${process.env.G_FAKE_LOG}.pids`,
      JSON.stringify({ pid: process.pid, ppid: process.ppid, kind, at: Date.now() }) + "\n",
    );
  } catch {
    /* ignore */
  }
}

// Real yt-dlp rewrites whatever --cookies file it was handed, on close.
async function writeBack() {
  const file = valOf("--cookies");
  if (!cfg.cookieWriteBack || !file) return;
  const text = String(cfg.cookieWriteBack);
  try {
    if (cfg.cookieWriteDelayMs) {
      const half = Math.floor(text.length / 2);
      fs.writeFileSync(file, text.slice(0, half));
      await sleep(cfg.cookieWriteDelayMs);
      fs.appendFileSync(file, text.slice(half));
    } else {
      fs.writeFileSync(file, text);
    }
  } catch {
    /* ignore */
  }
}

async function main() {
  if (has("--version")) {
    process.stdout.write("2099.12.31\n");
    return 0;
  }
  if (cfg.touchFile) {
    try {
      fs.writeFileSync(cfg.touchFile, "canary");
    } catch {
      /* ignore */
    }
  }

  const isProbe = has("-J") || has("--dump-json") || has("--dump-single-json");
  const isSimulate = has("--simulate");

  if (isSimulate) {
    markPid("simulate");
    if (cfg.authDelayMs) await sleep(cfg.authDelayMs);
    await writeBack();
    process.stderr.write(
      String(cfg.authOutput || "WARNING: nothing conclusive here") + "\n",
    );
    return 0;
  }

  if (isProbe) {
    if (cfg.probeDelayMs) await sleep(cfg.probeDelayMs);
    if (cfg.failProbe) {
      process.stderr.write(String(cfg.stderr || "ERROR: probe failed") + "\n");
      await writeBack();
      return 1;
    }
    const heights = Array.isArray(cfg.heights) ? cfg.heights : [360];
    process.stdout.write(
      JSON.stringify({
        id: "stub0000001",
        title: "Stub video",
        duration: cfg.duration === undefined ? 3600 : cfg.duration,
        formats: heights.map((h) => ({
          format_id: String(h),
          ext: "mp4",
          height: h,
          vcodec: "avc1",
          acodec: "mp4a",
          tbr: h * 3,
        })),
        comments: cfg.comments || [],
        comment_count: cfg.comments ? cfg.comments.length : 0,
      }) + "\n",
    );
    await writeBack();
    return 0;
  }

  // A download run.
  markPid(has("--download-sections") ? "section" : "full");
  if (cfg.delayMs) await sleep(cfg.delayMs);
  if (has("--download-sections") && cfg.failSections) {
    process.stderr.write("ERROR: unable to download: HTTP Error 403: Forbidden\n");
    await writeBack();
    return 1;
  }
  if (!has("--download-sections") && cfg.failFull) {
    process.stderr.write(String(cfg.fullStderr || "ERROR: full download failed") + "\n");
    await writeBack();
    return 1;
  }
  const out = valOf("--output") || valOf("-o");
  const fixture = process.env.G_FAKE_FIXTURE;
  if (out && fixture && !cfg.noOutput) {
    fs.mkdirSync(path.dirname(out), { recursive: true });
    const section = valOf("--download-sections");
    if (cfg.corruptSource && path.basename(out).startsWith("source.")) {
      fs.writeFileSync(out, fs.readFileSync(fixture).subarray(0, 4000));
    } else if (cfg.cutSections && section) {
      // Emulate real yt-dlp with --force-keyframes-at-cuts: an accurate,
      // re-encoded cut of the requested range, so the SECTIONED path can be
      // exercised with realistic pieces instead of the whole fixture.
      const m = /^\*([\d.]+)-([\d.]+)$/.exec(String(section));
      const start = m ? Number(m[1]) : 0;
      const end = m ? Number(m[2]) : 1;
      const r = require("node:child_process").spawnSync(
        process.env.G_FAKE_FFMPEG || "ffmpeg",
        [
          "-hide_banner", "-y", "-ss", String(start), "-i", fixture,
          "-t", String(end - start), "-fps_mode", "passthrough",
          "-c:v", "libx264", "-crf", "18", "-preset", "veryfast",
          "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "192k", out,
        ],
        { encoding: "utf8" },
      );
      if (r.status !== 0) {
        process.stderr.write(`fake cut failed: ${r.stderr}\n`);
        return 1;
      }
    } else {
      fs.copyFileSync(fixture, out);
    }
  }
  await writeBack();
  return 0;
}

main().then(
  (code) => process.exit(code || 0),
  (e) => {
    process.stderr.write(String(e) + "\n");
    process.exit(1);
  },
);
