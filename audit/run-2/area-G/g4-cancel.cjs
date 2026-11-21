/**
 * File: g4-cancel.cjs
 * Path: audit/run-2/area-G/g4-cancel.cjs
 * Description: Re-verifies run-1 G-10 against the new cancel contract, from
 * the PROCESS TABLE rather than the response:
 *   A  POST /api/download/cancel kills the engine. The fake engine is launched
 *      through a /bin/sh wrapper that does not exec, so the engine is a
 *      GRANDCHILD: only a process-GROUP kill takes it down, which is exactly
 *      what the fix claims to do.
 *   B  hanging the request up does the same.
 *   C  a cancel between segments stops the job before the next one starts.
 *   D  the auth probe loop stops when the client leaves.
 *   E  a cancel while the concat JOIN ffmpeg is running (segments.ts's
 *      runProcess, which the fix did not touch).
 *   F  what the progress channel says after a cancel.
 */
const fs = require("node:fs");
const G = require("./glib.cjs");

function body(segments, extra = {}) {
  return {
    url: G.YT_URL,
    quality: "360",
    format: "mp4",
    deliver: "path",
    segments,
    ...extra,
  };
}

/** Reads the whole process table for the fake engine and its shell wrapper. */
function engineProcs(serverPid) {
  return G.psLines("gfake.cjs")
    .filter((l) => !l.includes("grep"))
    .map((l) => l.trim());
}

async function main() {
  const out = { when: new Date().toISOString() };

  // --- A. cancel route kills the engine (grandchild) ----------------------
  {
    const s = await G.startServer({
      label: "cancel-A",
      cfg: { duration: 30, delayMs: 25_000 },
    });
    const p = s.post("/api/download?jobId=job_A", body([{ start: 0, end: 4 }]), {
      timeout: 120_000,
    });
    await G.sleep(2500);
    const pidsBefore = s.pids();
    const tracked = pidsBefore.map((x) => x.pid);
    const shellPids = tracked
      .map((pid) => {
        try {
          const stat = fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(" ");
          return Number(stat[3]);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    const t0 = Date.now();
    const cancel = await s.post("/api/download/cancel", { jobId: "job_A" });
    const r = await p;
    const answeredInMs = Date.now() - t0;
    await G.sleep(800);
    out.cancelRoute = {
      cancel: { status: cancel.status, body: cancel.json },
      download: { status: r.status, body: r.json },
      answeredInMs,
      enginePidsBefore: tracked,
      shellWrapperPids: shellPids,
      engineAliveAfter: tracked.map((pid) => ({ pid, alive: G.pidAlive(pid) })),
      shellAliveAfter: shellPids.map((pid) => ({ pid, alive: G.pidAlive(pid) })),
      psAfter: engineProcs(s.pid),
      workFoldersAfter: s.workFolders(),
      usageAfter: (await s.get("/api/cache/usage")).json,
      killLogLines: s.log().split("\n").filter((l) => /cancel/i.test(l)),
    };
    await s.stop();
  }

  // --- B. hang-up ---------------------------------------------------------
  {
    const s = await G.startServer({
      label: "cancel-B",
      cfg: { duration: 30, delayMs: 25_000 },
    });
    let req;
    const p = G.request({
      port: s.port,
      method: "POST",
      path: "/api/download?jobId=job_B",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body([{ start: 0, end: 4 }])),
      onRequest: (r) => (req = r),
      timeout: 120_000,
    });
    await G.sleep(2500);
    const pids = s.pids().map((x) => x.pid);
    const shells = pids
      .map((pid) => {
        try {
          return Number(fs.readFileSync(`/proc/${pid}/stat`, "utf8").split(" ")[3]);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
    req.destroy();
    const samples = [];
    for (const wait of [300, 1200, 4000]) {
      const prev = samples.length ? samples[samples.length - 1].atMs : 0;
      await G.sleep(wait - prev);
      samples.push({
        atMs: wait,
        engine: pids.map((pid) => ({ pid, alive: G.pidAlive(pid) })),
        shells: shells.map((pid) => ({ pid, alive: G.pidAlive(pid) })),
      });
    }
    const hangUp = await p.catch((e) => ({ error: String(e) }));
    out.hangUp = {
      responseAfterDestroy: hangUp,
      enginePids: pids,
      samples,
      serverSaidCancelling: s.log().includes("client went away"),
      workFoldersAfter: s.workFolders(),
    };
    await s.stop();
  }

  // --- C. cancel between segments -----------------------------------------
  {
    const s = await G.startServer({
      label: "cancel-C",
      cfg: { duration: 30, delayMs: 2500 },
    });
    const p = s.post(
      "/api/download?jobId=job_C",
      body([
        { start: 0, end: 2 },
        { start: 10, end: 12 },
        { start: 20, end: 22 },
      ]),
      { timeout: 120_000 },
    );
    await G.sleep(3500); // inside segment 2
    const runsBefore = s.pids().length;
    await s.post("/api/download/cancel", { jobId: "job_C" });
    const r = await p;
    await G.sleep(3500); // long enough for a 3rd segment to have started
    out.betweenSegments = {
      status: r.status,
      body: r.json,
      downloadRunsAtCancel: runsBefore,
      downloadRunsAfter: s.pids().length,
      startedAnotherSegment: s.pids().length > runsBefore,
      workFoldersAfter: s.workFolders(),
      usageAfter: (await s.get("/api/cache/usage")).json,
    };
    await s.stop();
  }

  // --- D. the auth probe loop ---------------------------------------------
  {
    const s = await G.startServer({
      label: "cancel-D",
      cfg: { authDelayMs: 2500, authOutput: "WARNING: nothing conclusive" },
    });
    let req;
    const p = G.request({
      port: s.port,
      method: "POST",
      path: "/api/auth/youtube/status",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ browser: "chrome" }),
      onRequest: (r) => (req = r),
      timeout: 120_000,
    });
    await G.sleep(1500);
    const before = s.pids().filter((x) => x.kind === "simulate").map((x) => x.pid);
    req.destroy();
    await G.sleep(3000);
    const after = s.pids().filter((x) => x.kind === "simulate").map((x) => x.pid);
    out.authProbeLoop = {
      simulateRunsAtHangUp: before,
      simulateRunsAfter: after,
      startedMoreAfterClientLeft: after.length > before.length,
      aliveAfter: after.map((pid) => ({ pid, alive: G.pidAlive(pid) })),
      log: s.log().split("\n").filter((l) => /probe/i.test(l)),
    };
    await p.catch(() => undefined);
    await s.stop();
  }

  // --- E. cancel while the concat join ffmpeg runs -------------------------
  {
    const s = await G.startServer({
      label: "cancel-E",
      // No failSections and no cutSections: every piece is the whole 30 s
      // fixture, so the copy join comes out ~600 s against 580 s expected and
      // the re-encode join (segments.ts runProcess) runs for tens of seconds.
      cfg: { duration: 3600 },
    });
    const segs = Array.from({ length: 20 }, (_, i) => ({
      start: i * 30,
      end: i * 30 + 29,
    }));
    const p = s.post("/api/download?jobId=job_E", body(segs), { timeout: 600_000 });
    // wait for the join to start
    let joinStarted = false;
    for (let i = 0; i < 240; i++) {
      await G.sleep(500);
      if (/job=job_E join|Joining/.test(s.log())) {
        joinStarted = true;
        break;
      }
    }
    const ffmpegBefore = G.psLines("-f concat").filter((l) => !l.includes("grep"));
    const t0 = Date.now();
    const cancel = await s.post("/api/download/cancel", { jobId: "job_E" });
    const r = await p;
    const answeredInMs = Date.now() - t0;
    await G.sleep(1500);
    const ffmpegAfter = G.psLines("-f concat").filter((l) => !l.includes("grep"));
    out.cancelDuringJoin = {
      joinStarted,
      cancel: { status: cancel.status, body: cancel.json },
      download: { status: r.status, body: r.json ?? (r.body || "").slice(0, 300) },
      answeredInMs,
      concatFfmpegBefore: ffmpegBefore.map((l) => l.trim().slice(0, 120)),
      concatFfmpegStillRunning: ffmpegAfter.map((l) => l.trim().slice(0, 120)),
      workFoldersAfter: s.workFolders(),
      usageAfter: (await s.get("/api/cache/usage")).json,
      joinLog: s.log().split("\n").filter((l) => /join/.test(l)),
    };
    // Does it eventually stop on its own?
    let stillAt = [];
    for (let i = 0; i < 24; i++) {
      await G.sleep(2500);
      stillAt = G.psLines("-f concat").filter((l) => !l.includes("grep"));
      if (stillAt.length === 0) break;
    }
    out.cancelDuringJoin.concatGoneAfterWaitingSec = stillAt.length === 0 ? "yes" : "still running after 60s";
    await s.stop();
  }

  // --- F. the progress channel after a cancel -----------------------------
  {
    const s = await G.startServer({
      label: "cancel-F",
      cfg: { duration: 30, delayMs: 8000 },
    });
    const events = [];
    const sse = G.request({
      port: s.port,
      method: "GET",
      path: "/api/download/progress?jobId=job_F",
      timeout: 30_000,
      onRequest: (r) =>
        r.on("response", (res) =>
          res.on("data", (c) => events.push(c.toString().trim())),
        ),
    });
    const p = s.post("/api/download?jobId=job_F", body([{ start: 0, end: 4 }]), {
      timeout: 120_000,
    });
    await G.sleep(2000);
    await s.post("/api/download/cancel", { jobId: "job_F" });
    const r = await p;
    await G.sleep(1200);
    out.progressAfterCancel = {
      download: { status: r.status, body: r.json },
      events,
      unknownJob: (
        await G.request({
          port: s.port,
          method: "GET",
          path: "/api/download/progress?jobId=job_never_existed",
          timeout: 2500,
        })
      ).body,
      noJobId: await G.request({
        port: s.port,
        method: "GET",
        path: "/api/download/progress",
        timeout: 2500,
      }).then((x) => ({ status: x.status, ct: x.headers["content-type"] ?? null, body: x.body })),
    };
    await sse.catch(() => undefined);
    await s.stop();
  }

  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g4-cancel", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
