/**
 * File: g11-resume.cjs
 * Path: audit/run-2/area-G/g11-resume.cjs
 * Description: Resume, against the new two-folder split (the shared keyed
 * folder for resumable data, a per-request folder for the clip). Run 1 cleared
 * resume as working; the split is new, so:
 *   1  a download that drops leaves a `.part` in the SHARED keyed folder, and
 *      the retry resumes from it (--continue, the resume log line, the clip).
 *   2  the SECOND of two identical downloads works in a private folder — what
 *      happens to its partial data when it fails?
 *   3  a finished clip.mp4 left in a work folder is not reused.
 *   4  the boot-time stale sweep, with an 8-day-old folder, a fresh one, and a
 *      protected one.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const G = require("./glib.cjs");

const body = (segments, extra = {}) => ({
  url: G.YT_URL,
  quality: "360",
  format: "mp4",
  deliver: "path",
  segments,
  ...extra,
});

function keyedFolder(tmpRoot, parts) {
  const hash = crypto
    .createHash("sha1")
    .update(parts.map(String).join("\u0000"))
    .digest("hex")
    .slice(0, 16);
  return path.join(tmpRoot, `ytclip-${hash}`);
}

const listing = (dir) => {
  try {
    return fs
      .readdirSync(dir)
      .map((f) => `${f}:${fs.statSync(path.join(dir, f)).size}`);
  } catch {
    return null;
  }
};

async function main() {
  const out = { when: new Date().toISOString() };

  // --- 1. resume after a dropped download ---------------------------------
  {
    const s = await G.startServer({
      label: "resume",
      cfg: { duration: 30, failSections: true, partialBytes: 5 * 1024 * 1024 },
    });
    const seg = { start: 0, end: 4 };
    const keyed = keyedFolder(s.serverTmp, [
      G.YT_URL,
      "mp4",
      "360",
      seg.start.toFixed(2),
      seg.end.toFixed(2),
    ]);
    const first = await s.post("/api/download?jobId=job_r1", body([seg]), {
      timeout: 300_000,
    });
    out.resume = {
      firstAttempt: {
        status: first.status,
        code: first.json && first.json.code,
        error: (first.json && first.json.error && first.json.error.slice(0, 120)) || null,
        preserved: first.json && first.json.preserved,
      },
      keyedFolderAfterFailure: listing(keyed),
      allFolders: s.workFolders(),
    };
    // now let it succeed
    s.configure({ duration: 30, failSections: true });
    const second = await s.post("/api/download?jobId=job_r2", body([seg]), {
      timeout: 300_000,
    });
    out.resume.secondAttempt = {
      status: second.status,
      durationSec:
        second.json && second.json.path && fs.existsSync(second.json.path)
          ? G.ffprobeDuration(second.json.path)
          : null,
    };
    out.resume.resumeLogLine = s
      .log()
      .split("\n")
      .filter((l) => /resum/i.test(l));
    out.resume.continueFlagPassed = s
      .calls()
      .some((c) => c.argv.includes("--continue"));
    out.resume.keyedFolderAfterSuccess = listing(keyed);
    await s.stop();
  }

  // --- 2. the second of two identical downloads, when it fails ------------
  {
    const s = await G.startServer({
      label: "resume-private",
      cfg: { duration: 30, failSections: true, delayMs: 3000, partialBytes: 3 * 1024 * 1024 },
    });
    const seg = { start: 0, end: 6 };
    const keyed = keyedFolder(s.serverTmp, [
      G.YT_URL,
      "mp4",
      "360",
      seg.start.toFixed(2),
      seg.end.toFixed(2),
    ]);
    const a = s.post("/api/download?jobId=job_pa", body([seg]), { timeout: 300_000 });
    await G.sleep(800);
    const b = s.post("/api/download?jobId=job_pb", body([seg]), { timeout: 300_000 });
    const [ra, rb] = await Promise.all([a, b]);
    out.privateFolderPartials = {
      A: { status: ra.status, code: ra.json && ra.json.code, preserved: ra.json && ra.json.preserved },
      B: { status: rb.status, code: rb.json && rb.json.code, preserved: rb.json && rb.json.preserved },
      keyedFolder: listing(keyed),
      allFoldersAfter: s.workFolders().map((f) => ({ f, files: listing(path.join(s.serverTmp, f)) })),
      privateFolderLog: s.log().split("\n").filter((l) => /private folder/.test(l)),
      bytesKeptForResume: (() => {
        let total = 0;
        for (const f of s.workFolders()) {
          for (const e of fs.readdirSync(path.join(s.serverTmp, f))) {
            if (/\.(part|ytdl)$/.test(e)) {
              total += fs.statSync(path.join(s.serverTmp, f, e)).size;
            }
          }
        }
        return total;
      })(),
    };
    // a retry now: does it resume, and from how much?
    s.configure({ duration: 30, failSections: true });
    const retry = await s.post("/api/download?jobId=job_pc", body([seg]), {
      timeout: 300_000,
    });
    out.privateFolderPartials.retry = {
      status: retry.status,
      resumeLines: s.log().split("\n").filter((l) => /resuming with/.test(l)),
    };
    await s.stop();
  }

  // --- 3. a finished clip left behind is not reused ------------------------
  {
    const s = await G.startServer({
      label: "resume-finished",
      cfg: { duration: 30, failSections: true },
    });
    const seg = { start: 2, end: 6 };
    const keyed = keyedFolder(s.serverTmp, [
      G.YT_URL,
      "mp4",
      "360",
      seg.start.toFixed(2),
      seg.end.toFixed(2),
    ]);
    fs.mkdirSync(keyed, { recursive: true });
    fs.writeFileSync(path.join(keyed, "clip.mp4"), "NOT A VIDEO, A MARKER");
    fs.writeFileSync(path.join(keyed, "source.mp4"), fs.readFileSync(G.FIXTURE));
    const r = await s.post("/api/download?jobId=job_fin", body([seg]), {
      timeout: 300_000,
    });
    out.finishedClipLeftBehind = {
      status: r.status,
      returnedPath: r.json && r.json.path,
      returnedIsInsideTheKeyedFolder:
        Boolean(r.json && r.json.path && path.dirname(r.json.path) === keyed),
      durationSec:
        r.json && r.json.path && fs.existsSync(r.json.path)
          ? G.ffprobeDuration(r.json.path)
          : null,
      markerStillInKeyedFolder: fs.existsSync(path.join(keyed, "clip.mp4"))
        ? fs.readFileSync(path.join(keyed, "clip.mp4"), "utf8").slice(0, 25)
        : null,
      reusedThePlantedSource: s.pids().length === 0,
      engineRuns: s.pids().length,
    };
    await s.stop();
  }

  // --- 4. the boot-time stale sweep ---------------------------------------
  {
    const tmp = fs.mkdtempSync(path.join(require("node:os").tmpdir(), "g2sweep-"));
    const old = path.join(tmp, "ytclip-OLD00000000000000");
    const fresh = path.join(tmp, "ytclip-FRESH000000000000");
    for (const d of [old, fresh]) {
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, "x.part"), "x".repeat(512));
    }
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    fs.utimesSync(old, eightDaysAgo, eightDaysAgo);
    const s = await G.startServer({
      label: "resume-sweep",
      cfg: { duration: 30 },
      env: { TMPDIR: tmp, TMP: tmp, TEMP: tmp },
    });
    out.staleSweep = {
      sweepLine: s.log().split("\n").filter((l) => /swept/.test(l)),
      oldGone: !fs.existsSync(old),
      freshKept: fs.existsSync(fresh),
    };
    await s.stop();
  }

  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g11-resume", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
