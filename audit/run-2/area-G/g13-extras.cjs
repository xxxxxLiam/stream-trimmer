/**
 * File: g13-extras.cjs
 * Path: audit/run-2/area-G/g13-extras.cjs
 * Description: Three things the other scripts do not cover.
 *   A  deliver:"stream" — the browser path. Are the bytes complete, is the
 *      content-length right, does the file play, and is the work folder
 *      cleaned up after a completed transfer?
 *   B  six different clips at once: no crossover, every reported size matches
 *      the file at its own path, and the cancel route still answers while they
 *      run (the re-encoding trim is now CPU-bound, so this is also a check
 *      that one job cannot starve the API).
 *   C  a second identical download while the first is in flight: how much work
 *      is duplicated now that it cannot share the first job's partials.
 */
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

async function main() {
  const out = { when: new Date().toISOString() };

  // --- A. stream delivery --------------------------------------------------
  {
    const s = await G.startServer({
      label: "x-stream",
      cfg: { duration: 30, failSections: true },
    });
    const r = await s.post(
      "/api/download?jobId=job_stream",
      body([{ start: 0, end: 4 }], { deliver: "stream" }),
      { timeout: 300_000 },
    );
    const file = path.join(G.AREA, "out", "stream-delivered.mp4");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, Buffer.from(r.body, "binary"));
    out.stream = {
      status: r.status,
      contentType: r.headers["content-type"],
      contentLength: Number(r.headers["content-length"]),
      disposition: r.headers["content-disposition"],
      xHeaders: Object.fromEntries(
        Object.entries(r.headers).filter(([k]) => k.startsWith("x-")),
      ),
      bytesReceived: Buffer.byteLength(r.body, "binary"),
      workFoldersAfter: s.workFolders(),
      usageAfter: (await s.get("/api/cache/usage")).json,
      logSent: s.log().split("\n").filter((l) => /sending|sent/.test(l)),
    };
    await s.stop();
  }

  // --- B. six different clips at once --------------------------------------
  {
    const s = await G.startServer({
      label: "x-six",
      cfg: { duration: 30, failSections: true },
    });
    const jobs = Array.from({ length: 6 }, (_, i) => ({
      id: `job_six_${i}`,
      segs: [{ start: i * 2, end: i * 2 + 3 }],
    }));
    const t0 = Date.now();
    const started = jobs.map((j) =>
      s.post(`/api/download?jobId=${j.id}`, body(j.segs), { timeout: 600_000 }),
    );
    await G.sleep(400);
    const cancelAnswer = await s.post("/api/download/cancel", { jobId: "job_not_running" });
    const usageDuring = await s.get("/api/cache/usage");
    const rs = await Promise.all(started);
    out.sixAtOnce = {
      wallSec: Number(((Date.now() - t0) / 1000).toFixed(1)),
      cancelRouteAnsweredWhileBusy: { status: cancelAnswer.status, body: cancelAnswer.json },
      usageRouteAnsweredWhileBusy: usageDuring.status,
      rows: rs.map((r, i) => ({
        id: jobs[i].id,
        status: r.status,
        path: r.json && r.json.path,
        size: r.json && r.json.size,
        sizeMatchesFile:
          r.json && r.json.path && fs.existsSync(r.json.path)
            ? fs.statSync(r.json.path).size === r.json.size
            : null,
        durationSec:
          r.json && r.json.path && fs.existsSync(r.json.path)
            ? G.ffprobeDuration(r.json.path)
            : null,
      })),
    };
    out.sixAtOnce.allDistinctPaths =
      new Set(out.sixAtOnce.rows.map((x) => x.path)).size === 6;
    await s.stop();
  }

  // --- C. duplicated work for a second identical download -----------------
  {
    const s = await G.startServer({
      label: "x-dup",
      cfg: { duration: 30, failSections: true, delayMs: 2500 },
    });
    const a = s.post("/api/download?jobId=job_dup_a", body([{ start: 0, end: 4 }]), {
      timeout: 300_000,
    });
    await G.sleep(600);
    const b = s.post("/api/download?jobId=job_dup_b", body([{ start: 0, end: 4 }]), {
      timeout: 300_000,
    });
    const [ra, rb] = await Promise.all([a, b]);
    const calls = s.calls();
    out.duplicatedWork = {
      A: ra.status,
      B: rb.status,
      engineDownloadRuns: s.pids().length,
      fullDownloadRuns: s.pids().filter((p) => p.kind === "full").length,
      sectionRuns: s.pids().filter((p) => p.kind === "section").length,
      metadataProbes: calls.filter((c) => c.argv.includes("--dump-single-json")).length,
      privateFolderLog: s.log().split("\n").filter((l) => /private folder/.test(l)),
    };
    await s.stop();
  }

  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g13-extras", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
