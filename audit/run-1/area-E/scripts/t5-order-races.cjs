/**
 * E/T5 — order of actions, repetition and races.
 *   a) cancel before start; progress-then-cancel-then-start with the same jobId
 *   b) start twice with one jobId; cancel twice
 *   c) progress polled after completion
 *   d) two concurrent exports of the same request (shared checkpoint folder)
 *   e) double-click Export in the UI
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const L = require("./lib.cjs");

/** The server's own checkpoint-folder key (server/resumeCache.ts: workDir). */
function ckDir(parts) {
  const h = crypto
    .createHash("sha1")
    .update(parts.map(String).join("\u0000"))
    .digest("hex")
    .slice(0, 16);
  return path.join(os.tmpdir(), "ytchan-" + h);
}

const CHANNEL = "https://www.youtube.com/@stubchannel";
const BASE = "https://www.youtube.com/@stubchannel";

(async () => {
  L.useShape("owner-star");
  const root = L.stubRoot("t5");
  const saveDir = "/tmp/area-E-save/t5";
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
  for (const n of fs.readdirSync("/tmp").filter((x) => x.startsWith("ytchan-")))
    fs.rmSync(path.join("/tmp", n), { recursive: true, force: true });

  L.writeStub(root, {
    info: L.channelInfo({
      count: 4,
      comments: [{ id: "c1", parent: "root", text: "hello", author: "A", author_id: "UC1", like_count: 1 }],
    }),
    vtt: "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\ncaption one\n",
    exitCode: 0,
    delayMs: 0,
    writeMedia: false,
  });

  const outDir = path.join(L.OUT, "t5-order");
  const a = await L.launchApp({
    label: "t5-order", outDir, cwd: root,
    seed: { "clipper.dataDirConfirmed": true, "clipper.dataDir": saveDir, "clipper.clipsDir": saveDir },
  });
  const r = {};
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);

    // ---- a) cancel before anything exists ------------------------------
    r.cancelBeforeStart = await L.api(a.win, "POST", "/api/channel/export/cancel", { jobId: "never-existed" });
    r.cancelNoJobId = await L.api(a.win, "POST", "/api/channel/export/cancel", {});
    r.cancelNullBody = await L.api(a.win, "POST", "/api/channel/export/cancel", null);

    // ---- a2) progress creates the job, then cancel poisons it ----------
    // The renderer opens the SSE *before* POSTing the export with the same
    // jobId, so a cancel that lands in between is a real ordering.
    const JOB = "poisoned-job-1";
    r.poison = {};
    r.poison.sseFirst = await L.sse(a.win, `/api/channel/export/progress?jobId=${JOB}`, 1200);
    r.poison.cancel = await L.api(a.win, "POST", "/api/channel/export/cancel", { jobId: JOB });
    r.poison.exportAfterCancel = await L.api(
      a.win, "POST", `/api/channel/export?jobId=${JOB}`,
      { url: CHANNEL, limit: 10, includeComments: false, includeTranscripts: false }, 60000,
    );

    // ---- b) start twice with one jobId, concurrently --------------------
    const JOB2 = "double-start-1";
    r.doubleStart = await a.win.evaluate(
      async ([job, url]) => {
        const base = window.__API_BASE__.replace(/\/$/, "");
        const body = JSON.stringify({ url, limit: 10, includeComments: false, includeTranscripts: false, fresh: true });
        const go = () =>
          fetch(`${base}/api/channel/export?jobId=${job}`, {
            method: "POST", headers: { "content-type": "application/json" }, body,
          }).then(async (res) => ({ status: res.status, body: (await res.text()).slice(0, 400) }));
        return Promise.all([go(), go()]);
      },
      [JOB2, CHANNEL],
    );
    r.cancelTwice = [
      await L.api(a.win, "POST", "/api/channel/export/cancel", { jobId: JOB2 }),
      await L.api(a.win, "POST", "/api/channel/export/cancel", { jobId: JOB2 }),
    ];

    // ---- c) progress after completion ----------------------------------
    const JOB3 = "finished-job-1";
    r.finished = {};
    r.finished.export = await L.api(
      a.win, "POST", `/api/channel/export?jobId=${JOB3}`,
      { url: CHANNEL, limit: 10, includeComments: false, includeTranscripts: false, fresh: true }, 60000,
    );
    r.finished.progressImmediately = await L.sse(a.win, `/api/channel/export/progress?jobId=${JOB3}`, 1200);
    await a.win.waitForTimeout(6500); // past the 5s job-cleanup timer
    r.finished.progressAfterCleanup = await L.sse(a.win, `/api/channel/export/progress?jobId=${JOB3}`, 1200);
    r.finished.progressNeverExisted = await L.sse(a.win, "/api/channel/export/progress?jobId=pure-fiction", 1200);

    // ---- d) two concurrent exports of the SAME request ------------------
    // Same (base, contentType, limit, parts) => same checkpoint folder.
    const ck = ckDir([BASE, "all", 10, true, true, true]);
    fs.rmSync(ck, { recursive: true, force: true });
    L.writeStub(root, {
      info: L.channelInfo({
        count: 4,
        comments: [{ id: "c1", parent: "root", text: "hello", author: "A", author_id: "UC1", like_count: 1 }],
      }),
      vtt: "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\ncaption one\n",
      exitCode: 0, delayMs: 120, writeMedia: false,
    });
    r.concurrent = await a.win.evaluate(
      async (url) => {
        const base = window.__API_BASE__.replace(/\/$/, "");
        const body = (job) =>
          JSON.stringify({ url, limit: 10, includeComments: true, includeTranscripts: true, deliver: "path" });
        const go = (job) =>
          fetch(`${base}/api/channel/export?jobId=${job}`, {
            method: "POST", headers: { "content-type": "application/json" }, body: body(job),
          }).then(async (res) => ({ job, status: res.status, body: (await res.text()).slice(0, 1200) }));
        return Promise.all([go("race-A"), go("race-B")]);
      },
      CHANNEL,
    );
    r.concurrentCheckpointAfter = (() => {
      try {
        return fs.readdirSync(ck).map((n) => {
          const p = path.join(ck, n);
          return { n, bytes: fs.statSync(p).size, lines: n.endsWith(".jsonl") ? fs.readFileSync(p, "utf8").split("\n").filter(Boolean).length : null };
        });
      } catch (e) {
        return "checkpoint folder gone: " + String(e.code || e);
      }
    })();
    r.concurrentOutputs = r.concurrent.map((x) => {
      try {
        const j = JSON.parse(x.body);
        return { job: x.job, status: x.status, counts: j.counts, dir: j.dir, files: (j.files || []).map((f) => `${f.name}:${f.bytes}`) };
      } catch {
        return { job: x.job, status: x.status, unparsed: x.body.slice(0, 200) };
      }
    });
    // The real row counts in the temp CSVs each response points at
    r.concurrentCsvRows = r.concurrentOutputs.map((o) => {
      if (!o.dir) return null;
      const out = { job: o.job };
      for (const n of ["videos.csv", "comments.csv", "transcripts.csv"]) {
        const p = path.join(o.dir, n);
        try {
          out[n] = fs.readFileSync(p, "utf8").split("\r\n").filter(Boolean).length - 1;
        } catch (e) {
          out[n] = "missing/" + String(e.code);
        }
      }
      return out;
    });

    // ---- e) double-click Export in the UI ------------------------------
    L.writeStub(root, {
      info: L.channelInfo({ count: 4 }), vtt: "", exitCode: 0, delayMs: 400, writeMedia: false,
    });
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });
    await a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]').fill(CHANNEL);
    await a.win.locator('input[type="number"]').fill("10");
    const btn = a.win.locator('button:has-text("Export channel")');
    r.doubleClick = {};
    // two clicks as fast as Playwright can deliver them
    await btn.dispatchEvent("click");
    await btn.dispatchEvent("click").catch((e) => { r.doubleClick.secondClickError = String(e).slice(0, 160); });
    r.doubleClick.shot = await a.shot("double-click");
    r.doubleClick.sawStop = await a.win
      .waitForSelector('button:has-text("Stop")', { timeout: 4000 })
      .then(() => true).catch(() => false);
    await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 90000 }).catch(() => {});
    r.doubleClick.result = await a.win.evaluate(() => {
      const t = document.body.innerText;
      const m = t.match(/(Partial export saved|Export saved)[\s\S]{0,140}/);
      return m ? m[0] : null;
    });
    r.doubleClick.shotDone = await a.shot("double-click-done");
  } catch (e) {
    r.error = String(e).slice(0, 800);
    r.shot_error = await a.shot("error");
  } finally {
    r.pageErrors = a.logs.pageErrors;
    r.serverLog = a.logs.stdout.join("").split("\n").filter((l) => /channel|export/i.test(l)).slice(-25);
    await a.close();
  }
  r.savedFolders = fs.existsSync(saveDir) ? fs.readdirSync(saveDir) : [];
  r.tmpYtchan = fs.readdirSync("/tmp").filter((n) => n.startsWith("ytchan-"));
  console.log(JSON.stringify(r, null, 2));
  L.save(outDir, "report.json", r);
})();
