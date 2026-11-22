/**
 * File: g3-isolation.cjs
 * Path: audit/run-2/area-G/g3-isolation.cjs
 * Description: Re-verifies run-1 G-1 (two downloads of the same video +
 * quality + ranges shared one work folder and deleted each other's files) and
 * the isolation half of the new cancel contract (G-10).
 *
 *   1  two identical downloads at once: different paths, both files on disk,
 *      each reported size describes the file at the path it returned.
 *   2  cancel one of two identical downloads: the neighbour finishes and its
 *      clip survives the cancelled job's cleanup.
 *   3  two identical downloads that share a jobId, then one cancel.
 *   4  cancel with an unknown id, a missing id, and a late cancel after the
 *      clip was handed over.
 */
const fs = require("node:fs");
const G = require("./glib.cjs");

const SEGS = [
  { start: 0, end: 4 },
  { start: 10, end: 14 },
  { start: 20, end: 24 },
];

function body(extra = {}) {
  return {
    url: G.YT_URL,
    quality: "360",
    format: "mp4",
    deliver: "path",
    segments: SEGS,
    ...extra,
  };
}

function describe(r) {
  if (r.error) return { error: r.error };
  const o = { status: r.status, body: r.json ?? r.body.slice(0, 200) };
  if (r.json && r.json.path) {
    o.exists = fs.existsSync(r.json.path);
    o.sizeOnDisk = o.exists ? fs.statSync(r.json.path).size : null;
    o.sizeMatchesBody = o.sizeOnDisk === r.json.size;
    o.durationSec = o.exists ? G.ffprobeDuration(r.json.path) : null;
  }
  return o;
}

async function main() {
  const out = { when: new Date().toISOString() };

  // --- 1. two identical downloads at once ---------------------------------
  {
    const s = await G.startServer({
      label: "iso-race",
      cfg: { duration: 30, failSections: true, delayMs: 2500 },
    });
    const a = s.post("/api/download?jobId=job_key_a", body(), { timeout: 300_000 });
    await G.sleep(1200);
    const b = s.post("/api/download?jobId=job_key_b", body(), { timeout: 300_000 });
    const [ra, rb] = await Promise.all([a, b]);
    out.race = {
      A: describe(ra),
      B: describe(rb),
      samePath:
        Boolean(ra.json && rb.json) && ra.json.path === rb.json.path,
      workFolders: s.workFolders(),
      logJoin: s.log().split("\n").filter((l) => /join|private folder/.test(l)),
    };
    out.race.bothFilesCoexist =
      out.race.A.exists === true && out.race.B.exists === true;
    await s.stop();
  }

  // --- 2. cancel one of two identical downloads ---------------------------
  {
    const s = await G.startServer({
      label: "iso-cancel",
      cfg: { duration: 30, failSections: true, delayMs: 6000 },
    });
    const a = s.post("/api/download?jobId=job_cancel_a", body(), { timeout: 300_000 });
    const b = s.post("/api/download?jobId=job_cancel_b", body(), { timeout: 300_000 });
    await G.sleep(2000);
    const pidsBefore = s.pids();
    const cancel = await s.post("/api/download/cancel", { jobId: "job_cancel_a" });
    await G.sleep(600);
    const alive = pidsBefore.map((p) => ({ ...p, alive: G.pidAlive(p.pid) }));
    const [ra, rb] = await Promise.all([a, b]);
    out.cancelOneOfTwo = {
      cancelResponse: { status: cancel.status, body: cancel.json },
      pidsAtCancel: alive,
      A: describe(ra),
      B: describe(rb),
      workFoldersAfter: s.workFolders(),
      neighbourSurvived: rb.status === 200 && describe(rb).exists === true,
      logLines: s.log().split("\n").filter((l) => /cancel|499|private folder/.test(l)),
    };
    await s.stop();
  }

  // --- 3. two identical downloads sharing one jobId -----------------------
  {
    const s = await G.startServer({
      label: "iso-samejob",
      cfg: { duration: 30, failSections: true, delayMs: 6000 },
    });
    const a = s.post("/api/download?jobId=job_same", body(), { timeout: 300_000 });
    const b = s.post("/api/download?jobId=job_same", body(), { timeout: 300_000 });
    await G.sleep(1500);
    const cancel = await s.post("/api/download/cancel", { jobId: "job_same" });
    const [ra, rb] = await Promise.all([a, b]);
    out.sharedJobId = {
      cancelResponse: { status: cancel.status, body: cancel.json },
      A: describe(ra),
      B: describe(rb),
      bothCancelled: ra.status === 499 && rb.status === 499,
    };
    await s.stop();
  }

  // --- 4. unknown / missing / late cancel ---------------------------------
  {
    const s = await G.startServer({
      label: "iso-late",
      cfg: { duration: 30, failSections: true },
    });
    out.unknownId = await s
      .post("/api/download/cancel", { jobId: "job_never_existed" })
      .then((r) => ({ status: r.status, body: r.json }));
    out.unknownIdWeird = await s
      .post("/api/download/cancel", { jobId: "../../etc/passwd" })
      .then((r) => ({ status: r.status, body: r.json }));
    out.missingId = await s
      .post("/api/download/cancel", {})
      .then((r) => ({ status: r.status, body: r.json, ct: r.headers["content-type"] }));
    out.nonStringId = await s
      .post("/api/download/cancel", { jobId: 42 })
      .then((r) => ({ status: r.status, body: r.json }));
    out.queryId = await s
      .post("/api/download/cancel?jobId=job_q", null)
      .then((r) => ({ status: r.status, body: r.json }));

    const done = await s.post("/api/download?jobId=job_finished", body(), {
      timeout: 300_000,
    });
    const d = describe(done);
    const late = await s.post("/api/download/cancel", { jobId: "job_finished" });
    await G.sleep(400);
    out.lateCancel = {
      download: d,
      cancel: { status: late.status, body: late.json },
      clipStillThere: done.json && done.json.path ? fs.existsSync(done.json.path) : null,
      sizeAfter:
        done.json && done.json.path && fs.existsSync(done.json.path)
          ? fs.statSync(done.json.path).size
          : null,
      usageAfter: (await s.get("/api/cache/usage")).json,
    };
    await s.stop();
  }

  console.log(JSON.stringify(out, null, 2));
  console.log("results:", G.saveResults("g3-isolation", out));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
