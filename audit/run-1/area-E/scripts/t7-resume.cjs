/**
 * E/T7 — the interruption tests from T6 (a) and (b), re-run with a stub slow
 * enough that the kill and the cache-clear genuinely land mid-export.
 *   10 videos, 1.5 s per yt-dlp call => roughly a 38 s run.
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const L = require("./lib.cjs");

function ckDir(parts) {
  const h = crypto.createHash("sha1").update(parts.map(String).join("\u0000")).digest("hex").slice(0, 16);
  return path.join(os.tmpdir(), "ytchan-" + h);
}
const CHANNEL = "https://www.youtube.com/@stubchannel";
const listTmp = () => fs.readdirSync("/tmp").filter((n) => n.startsWith("ytchan-")).sort();
const wipeTmp = () => { for (const n of listTmp()) fs.rmSync(path.join("/tmp", n), { recursive: true, force: true }); };
const dirInfo = (d) => {
  try {
    return fs.readdirSync(d).map((n) => {
      const p = path.join(d, n);
      let lines = null;
      if (n.endsWith(".jsonl")) lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean).length;
      return { n, bytes: fs.statSync(p).size, lines };
    });
  } catch (e) { return "gone:" + String(e.code); }
};
const csvRows = (d, n) => {
  try { return fs.readFileSync(path.join(d, n), "utf8").split("\r\n").filter(Boolean).length - 1; }
  catch (e) { return "missing/" + String(e.code); }
};
const dupes = (d, n) => {
  try {
    const lines = fs.readFileSync(path.join(d, n), "utf8").split("\r\n").filter(Boolean).slice(1);
    const m = new Map();
    for (const l of lines) m.set(l, (m.get(l) || 0) + 1);
    return [...m.entries()].filter(([, c]) => c > 1).map(([l, c]) => `${c}x ${l.slice(0, 64)}`);
  } catch { return "n/a"; }
};

const info = L.channelInfo({
  count: 10,
  comments: [{ id: "c1", parent: "root", text: "hello", author: "A", author_id: "UC1", like_count: 1 }],
});
const STUB = {
  info, vtt: "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\ncaption one\n",
  exitCode: 0, delayMs: 1500, writeMedia: false,
};

async function openExporter(a) {
  await a.win.waitForSelector("header", { timeout: 20000 });
  await L.signIn(a);
  await a.win.click("#ui-channel-link");
  await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });
  await a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]').fill(CHANNEL);
  await a.win.locator('input[type="number"]').fill("10");
}

(async () => {
  L.useShape("owner-star");
  const root = L.stubRoot("t7");
  L.writeStub(root, STUB);
  const saveDir = "/tmp/area-E-save/t7";
  const seed = { "clipper.dataDirConfirmed": true, "clipper.dataDir": saveDir, "clipper.clipsDir": saveDir };
  const outDir = path.join(L.OUT, "t7-resume");
  const r = {};
  const CK = ckDir([CHANNEL, "all", 10, true, true, true]);
  r.checkpointKeyDir = CK;

  // ---------- a) SIGKILL mid-export, relaunch, resume -------------------
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
  wipeTmp();
  {
    const a = await L.launchApp({ label: "t7-kill", outDir, cwd: root, seed });
    await openExporter(a);
    await a.win.locator('button:has-text("Export channel")').click();
    await a.win.waitForSelector('button:has-text("Stop")', { timeout: 15000 });
    await new Promise((res) => setTimeout(res, 20000));
    r.midExportProgress = await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Reading the channel list|Video details \d+ of \d+|Comments and transcripts, video \d+ of \d+)/);
      return m ? m[0] : null;
    });
    r.midExportShot = await a.shot("mid-export");
    r.beforeKill = { tmp: listTmp(), checkpoint: dirInfo(CK) };
    a.app.process().kill("SIGKILL");
    await new Promise((res) => setTimeout(res, 3000));
    r.afterKill = {
      tmp: listTmp(), checkpoint: dirInfo(CK), saveDir: fs.readdirSync(saveDir),
    };
    try { await a.close(); } catch { /* dead */ }
  }
  {
    const a = await L.launchApp({ label: "t7-resume", outDir, cwd: root, seed });
    await openExporter(a);
    await a.win.locator('button:has-text("Export channel")').click();
    await a.win.waitForSelector('button:has-text("Stop")', { timeout: 15000 });
    await new Promise((res) => setTimeout(res, 2500));
    r.resumeProgressText = await a.win.evaluate(() => {
      const t = document.body.innerText;
      return {
        resuming: (t.match(/Resuming[^\n]*/) || [null])[0],
        phase: (t.match(/(Reading the channel list|Video details \d+ of \d+|Comments and transcripts, video \d+ of \d+)/) || [null])[0],
      };
    });
    r.resumeShot = await a.shot("resume-progress");
    await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 240000 });
    r.resumeResult = await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Partial export saved|Export saved)[\s\S]{0,170}/);
      return m ? m[0] : null;
    });
    r.resumeShotDone = await a.shot("resume-done");
    r.resumeServerLog = a.logs.stdout.join("").split("\n").filter((l) => /resum|export/i.test(l)).slice(-8);
    await a.close();
  }
  {
    const f = fs.readdirSync(saveDir)[0];
    const d = f ? path.join(saveDir, f) : null;
    r.afterResume = {
      folders: fs.readdirSync(saveDir),
      rows: d && { videos: csvRows(d, "videos.csv"), comments: csvRows(d, "comments.csv"), transcripts: csvRows(d, "transcripts.csv"), status: csvRows(d, "video-status.csv") },
      summary: d && fs.readFileSync(path.join(d, "summary.csv"), "utf8"),
      dupeComments: d && dupes(d, "comments.csv"),
      dupeTranscripts: d && dupes(d, "transcripts.csv"),
      tmp: listTmp(),
    };
  }

  // ---------- b) clear the cache mid-export -----------------------------
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
  wipeTmp();
  {
    const a = await L.launchApp({ label: "t7-cacheclear", outDir, cwd: root, seed });
    await openExporter(a);
    await a.win.locator('button:has-text("Export channel")').click();
    await a.win.waitForSelector('button:has-text("Stop")', { timeout: 15000 });
    await new Promise((res) => setTimeout(res, 20000));
    r.cacheClear = {};
    r.cacheClear.phaseAtClear = await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Reading the channel list|Video details \d+ of \d+|Comments and transcripts, video \d+ of \d+)/);
      return m ? m[0] : null;
    });
    r.cacheClear.checkpointBefore = dirInfo(CK);
    r.cacheClear.usageBefore = (await L.api(a.win, "GET", "/api/cache/usage")).body;
    r.cacheClear.cleared = (await L.api(a.win, "POST", "/api/cache/clear", {})).body;
    r.cacheClear.tmpAfter = listTmp();
    await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 240000 });
    r.cacheClear.result = await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Partial export saved|Export saved)[\s\S]{0,170}/);
      return m ? m[0] : null;
    });
    r.cacheClear.errorBanner = await a.win.evaluate(() => {
      const el = document.querySelector('[role="alert"]');
      return el ? el.textContent.trim() : null;
    });
    r.cacheClear.shot = await a.shot("after-cache-clear");
    await a.close();
  }
  {
    const f = fs.readdirSync(saveDir)[0];
    const d = f ? path.join(saveDir, f) : null;
    r.cacheClear.folders = fs.readdirSync(saveDir);
    r.cacheClear.rows = d && { videos: csvRows(d, "videos.csv"), comments: csvRows(d, "comments.csv"), transcripts: csvRows(d, "transcripts.csv") };
    r.cacheClear.summary = d && fs.readFileSync(path.join(d, "summary.csv"), "utf8");
  }

  // ---------- c) cancel, then resume ------------------------------------
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
  wipeTmp();
  {
    const a = await L.launchApp({ label: "t7-cancel", outDir, cwd: root, seed });
    await openExporter(a);
    await a.win.locator('button:has-text("Export channel")').click();
    await a.win.waitForSelector('button:has-text("Stop")', { timeout: 15000 });
    await new Promise((res) => setTimeout(res, 18000));
    r.cancelFlow = { phaseAtStop: await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Reading the channel list|Video details \d+ of \d+|Comments and transcripts, video \d+ of \d+)/);
      return m ? m[0] : null;
    }) };
    await a.win.locator('button:has-text("Stop")').click();
    await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 120000 });
    r.cancelFlow.result = await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Partial export saved|Export saved)[\s\S]{0,170}/);
      return m ? m[0] : null;
    });
    r.cancelFlow.shot = await a.shot("after-cancel");
    const f1 = fs.readdirSync(saveDir)[0];
    const d1 = path.join(saveDir, f1);
    r.cancelFlow.partialRows = { videos: csvRows(d1, "videos.csv"), comments: csvRows(d1, "comments.csv"), transcripts: csvRows(d1, "transcripts.csv") };
    r.cancelFlow.partialSummary = fs.readFileSync(path.join(d1, "summary.csv"), "utf8");
    r.cancelFlow.checkpointKept = dirInfo(CK);
    // resume
    await a.win.locator('button[aria-label="Dismiss"]').first().click();
    await a.win.locator('button:has-text("Export channel")').click();
    await a.win.waitForSelector('button:has-text("Stop")', { timeout: 15000 });
    await new Promise((res) => setTimeout(res, 2500));
    r.cancelFlow.resumeLabel = await a.win.evaluate(() => {
      const t = document.body.innerText;
      return (t.match(/Resuming[^\n]*/) || [null])[0];
    });
    r.cancelFlow.resumeShot = await a.shot("resume-after-cancel");
    await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 240000 });
    r.cancelFlow.resumeResult = await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Partial export saved|Export saved)[\s\S]{0,170}/);
      return m ? m[0] : null;
    });
    r.cancelFlow.serverLog = a.logs.stdout.join("").split("\n").filter((l) => /resum|export/i.test(l)).slice(-8);
    await a.close();
    const f2 = fs.readdirSync(saveDir)[0];
    const d2 = path.join(saveDir, f2);
    r.cancelFlow.finalRows = { videos: csvRows(d2, "videos.csv"), comments: csvRows(d2, "comments.csv"), transcripts: csvRows(d2, "transcripts.csv"), status: csvRows(d2, "video-status.csv") };
    r.cancelFlow.finalSummary = fs.readFileSync(path.join(d2, "summary.csv"), "utf8");
    r.cancelFlow.finalDupes = { comments: dupes(d2, "comments.csv"), transcripts: dupes(d2, "transcripts.csv"), status: dupes(d2, "video-status.csv") };
  }

  console.log(JSON.stringify(r, null, 2));
  L.save(outDir, "report.json", r);
})();
