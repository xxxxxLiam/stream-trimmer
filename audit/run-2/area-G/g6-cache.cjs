/**
 * File: g6-cache.cjs
 * Path: audit/run-2/area-G/g6-cache.cjs
 * Description: Re-verifies run-1 G-8 (Clear cache destroying live work and
 * finished clips) against the new in-use registry, and hunts what the registry
 * broke: folders that are protected and never released, and a usage figure
 * that no longer describes the disk.
 *
 *   1  Clear while a three-segment job is mid-flight (the case slice 2 showed
 *      losing the whole download).
 *   2  Clear immediately after a deliver:"path" 200 — the handed-over clip.
 *   3  Five uncollected clips: what the user is told is on disk vs what is.
 *   4  A leak detector: after a battery of successes, failures, cancels and
 *      hang-ups with nothing running, Clear must remove everything and skip
 *      nothing.
 *   5  A foreign ytclip-* folder (run-1 G-18) and a held folder across a
 *      server restart.
 */
const fs = require("node:fs");
const path = require("node:path");
const G = require("./glib.cjs");

const SEGS3 = [
  { start: 0, end: 4 },
  { start: 10, end: 14 },
  { start: 20, end: 24 },
];
const body = (segments, extra = {}) => ({
  url: G.YT_URL,
  quality: "360",
  format: "mp4",
  deliver: "path",
  segments,
  ...extra,
});

function dirBytes(dir) {
  let total = 0;
  const walk = (d) => {
    let entries = [];
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(d, e.name);
      try {
        if (e.isDirectory()) walk(full);
        else total += fs.statSync(full).size;
      } catch {
        /* ignore */
      }
    }
  };
  walk(dir);
  return total;
}

async function main() {
  const out = { when: new Date().toISOString() };

  // --- 1. Clear while a three-segment job runs -----------------------------
  {
    const s = await G.startServer({
      label: "cache-live",
      cfg: { duration: 30, failSections: true, delayMs: 2500 },
    });
    const abandoned = path.join(s.serverTmp, "ytclip-ABANDONED00000000");
    fs.mkdirSync(abandoned, { recursive: true });
    fs.writeFileSync(path.join(abandoned, "old.part"), "x".repeat(2048));
    const p = s.post("/api/download?jobId=job_live", body(SEGS3), { timeout: 300_000 });
    // wait until the job has written its first segment
    let sawSegment = false;
    for (let i = 0; i < 80; i++) {
      await G.sleep(250);
      const files = s
        .workFolders()
        .flatMap((f) => {
          try {
            return fs.readdirSync(path.join(s.serverTmp, f));
          } catch {
            return [];
          }
        });
      if (files.some((f) => /^(seg-01|source)\./.test(f))) {
        sawSegment = true;
        break;
      }
    }
    const foldersAtClear = s.workFolders();
    const clear = await s.post("/api/cache/clear", {});
    const foldersAfterClear = s.workFolders();
    const r = await p;
    out.clearDuringLiveJob = {
      sawSegmentBeforeClear: sawSegment,
      foldersAtClear,
      clear: clear.json,
      foldersAfterClear,
      abandonedRemoved: !fs.existsSync(abandoned),
      download: {
        status: r.status,
        body: r.json ?? (r.body || "").slice(0, 200),
        exists: r.json && r.json.path ? fs.existsSync(r.json.path) : null,
        durationSec: r.json && r.json.path && fs.existsSync(r.json.path)
          ? G.ffprobeDuration(r.json.path)
          : null,
      },
    };
    // and a second clear now the clip is finished and uncollected
    const clear2 = await s.post("/api/cache/clear", {});
    out.clearDuringLiveJob.secondClear = clear2.json;
    out.clearDuringLiveJob.clipSurvivedSecondClear =
      r.json && r.json.path ? fs.existsSync(r.json.path) : null;
    await s.stop();
  }

  // --- 2 & 3. the hand-off hold -------------------------------------------
  {
    const s = await G.startServer({
      label: "cache-hold",
      cfg: { duration: 30, failSections: true },
    });
    const clips = [];
    for (let i = 0; i < 5; i++) {
      const r = await s.post(
        `/api/download?jobId=job_hold_${i}`,
        body([{ start: i, end: i + 2 }]),
        { timeout: 300_000 },
      );
      clips.push({
        status: r.status,
        path: r.json && r.json.path,
        size: r.json && r.json.size,
      });
    }
    const usage = (await s.get("/api/cache/usage")).json;
    const realBytes = dirBytes(s.serverTmp);
    const clear = await s.post("/api/cache/clear", {});
    out.handoffHold = {
      clips,
      allStillOnDisk: clips.every((c) => c.path && fs.existsSync(c.path)),
      usageReported: usage,
      actualBytesInTempRoot: realBytes,
      clear: clear.json,
      stillOnDiskAfterClear: clips.map((c) => (c.path ? fs.existsSync(c.path) : null)),
      workFolders: s.workFolders(),
      holdMs: 30 * 60 * 1000,
    };
    // a held folder across a restart: the registry is in-process only
    const tmpRoot = s.serverTmp;
    await s.stop();
    const s2 = await G.startServer({
      label: "cache-hold2",
      cfg: { duration: 30 },
      env: { TMPDIR: tmpRoot, TMP: tmpRoot, TEMP: tmpRoot },
    });
    const usage2 = (await s2.get("/api/cache/usage")).json;
    const clear3 = await s2.post("/api/cache/clear", {});
    out.handoffHold.afterRestart = {
      usage: usage2,
      clear: clear3.json,
      clipsStillThere: clips.map((c) => (c.path ? fs.existsSync(c.path) : null)),
      sweepLine: s2.log().split("\n").filter((l) => /swept/.test(l)),
    };
    await s2.stop();
  }

  // --- 4. leak detector ---------------------------------------------------
  {
    const s = await G.startServer({
      label: "cache-leak",
      cfg: { duration: 30, failSections: true },
    });
    const events = [];
    // a success
    events.push(["ok", (await s.post("/api/download?jobId=j1", body([{ start: 0, end: 2 }]), { timeout: 300_000 })).status]);
    // a hard failure
    s.configure({ duration: 30, failSections: true, failFull: true });
    events.push(["fail", (await s.post("/api/download?jobId=j2", body([{ start: 0, end: 2 }]), { timeout: 300_000 })).status]);
    // no output at all
    s.configure({ duration: 30, failSections: true, noOutput: true });
    events.push(["noout", (await s.post("/api/download?jobId=j3", body([{ start: 0, end: 2 }]), { timeout: 300_000 })).status]);
    // a cancel
    s.configure({ duration: 30, failSections: true, delayMs: 8000 });
    const pc = s.post("/api/download?jobId=j4", body([{ start: 0, end: 2 }]), { timeout: 300_000 });
    await G.sleep(1200);
    await s.post("/api/download/cancel", { jobId: "j4" });
    events.push(["cancel", (await pc).status]);
    // a hang-up
    let req;
    const ph = G.request({
      port: s.port,
      method: "POST",
      path: "/api/download?jobId=j5",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body([{ start: 0, end: 2 }])),
      onRequest: (r) => (req = r),
      timeout: 60_000,
    });
    await G.sleep(1200);
    req.destroy();
    await ph.catch(() => undefined);
    await G.sleep(1500);
    // a streamed delivery, collected in full
    s.configure({ duration: 30, failSections: true });
    const st = await s.post(
      "/api/download?jobId=j6",
      body([{ start: 0, end: 2 }], { deliver: "stream" }),
      { timeout: 300_000 },
    );
    events.push(["stream", st.status]);
    // a bad request
    events.push(["badbody", (await s.post("/api/download?jobId=j7", { url: "nope" })).status]);
    await G.sleep(800);
    const usage = (await s.get("/api/cache/usage")).json;
    const clear = await s.post("/api/cache/clear", {});
    out.leakDetector = {
      events,
      usageWithNothingRunning: usage,
      clear: clear.json,
      foldersLeftAfterClear: s.workFolders(),
      bytesLeftAfterClear: dirBytes(s.serverTmp),
      leaked: clear.json && clear.json.skipped > 0,
    };
    await s.stop();
  }

  // --- 5. a foreign work folder -------------------------------------------
  {
    const s = await G.startServer({ label: "cache-foreign", cfg: { duration: 30 } });
    const foreign = path.join(s.serverTmp, "ytclip-NOT-OURS-0000");
    fs.mkdirSync(foreign, { recursive: true });
    fs.writeFileSync(path.join(foreign, "someone-elses-file"), "x".repeat(1024));
    const usage = (await s.get("/api/cache/usage")).json;
    const clear = await s.post("/api/cache/clear", {});
    out.foreignFolder = {
      usage,
      clear: clear.json,
      stillExists: fs.existsSync(foreign),
    };
    await s.stop();
  }

  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g6-cache", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
