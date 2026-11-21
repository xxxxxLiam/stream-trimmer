/**
 * E/T6 — interruptions and state over time.
 *   a) SIGKILL the app mid-export, relaunch, re-run the same request: does it
 *      resume, is the cache consistent, are partial CSVs left behind?
 *   b) "Clear cache" while an export is running.
 *   c) Two runs of the same channel on the same day with different parts:
 *      what does the destination folder end up holding?
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
      const s = fs.statSync(p);
      let lines = null;
      if (n.endsWith(".jsonl")) lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean).length;
      return { n, bytes: s.size, lines };
    });
  } catch (e) { return "gone:" + String(e.code); }
};
const csvRows = (d, n) => {
  try { return fs.readFileSync(path.join(d, n), "utf8").split("\r\n").filter(Boolean).length - 1; }
  catch (e) { return "missing/" + String(e.code); }
};

const SLOW = {
  info: null, vtt: "WEBVTT\n\n1\n00:00:00.000 --> 00:00:02.000\ncaption one\n",
  exitCode: 0, delayMs: 700, writeMedia: false,
};

(async () => {
  L.useShape("owner-star");
  const root = L.stubRoot("t6");
  const saveDir = "/tmp/area-E-save/t6";
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
  wipeTmp();

  const info = L.channelInfo({
    count: 6,
    comments: [{ id: "c1", parent: "root", text: "hello", author: "A", author_id: "UC1", like_count: 1 }],
  });
  L.writeStub(root, { ...SLOW, info });

  const seed = { "clipper.dataDirConfirmed": true, "clipper.dataDir": saveDir, "clipper.clipsDir": saveDir };
  const outDir = path.join(L.OUT, "t6-interrupt");
  const r = {};
  const CK = ckDir([CHANNEL, "all", 10, true, true, true]);
  r.checkpointKeyDir = CK;

  // =====================================================================
  // a) kill mid-export, relaunch, resume
  // =====================================================================
  {
    const a = await L.launchApp({ label: "t6-kill", outDir, cwd: root, seed });
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });
    await a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]').fill(CHANNEL);
    await a.win.locator('input[type="number"]').fill("10");
    await a.win.locator('button:has-text("Export channel")').click();
    await a.win.waitForSelector('button:has-text("Stop")', { timeout: 10000 });
    // let a couple of videos land in the checkpoint
    await new Promise((res) => setTimeout(res, 14000));
    r.killShot = await a.shot("mid-export-before-kill");
    r.beforeKill = { tmp: listTmp(), checkpoint: dirInfo(CK) };
    // hard kill: what a crash or a power cut looks like
    a.app.process().kill("SIGKILL");
    await new Promise((res) => setTimeout(res, 2500));
    r.afterKill = { tmp: listTmp(), checkpoint: dirInfo(CK), saveDir: fs.readdirSync(saveDir) };
    try { await a.close(); } catch { /* already dead */ }
  }

  // relaunch and re-run the identical request
  {
    const a = await L.launchApp({ label: "t6-resume", outDir, cwd: root, seed });
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });
    r.freshCheckboxDefault = await a.win.evaluate(() => {
      const lab = Array.from(document.querySelectorAll("label")).find((l) =>
        l.textContent.includes("Start over"));
      const box = lab?.querySelector('input[type="checkbox"]');
      return box ? box.checked : "no checkbox";
    });
    await a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]').fill(CHANNEL);
    await a.win.locator('input[type="number"]').fill("10");
    await a.win.locator('button:has-text("Export channel")').click();
    try {
      await a.win.waitForSelector('button:has-text("Stop")', { timeout: 8000 });
      await new Promise((res) => setTimeout(res, 1200));
      r.resumeProgressText = await a.win.evaluate(() => {
        const m = document.body.innerText.match(/Resuming[^\n]*/);
        return m ? m[0] : null;
      });
      r.resumeShot = await a.shot("resume-progress");
    } catch { r.resumeProgressText = "progress panel not seen"; }
    await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 180000 });
    r.resumeResult = await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Partial export saved|Export saved)[\s\S]{0,160}/);
      return m ? m[0] : null;
    });
    r.resumeShotDone = await a.shot("resume-done");
    r.resumeServerLog = a.logs.stdout.join("").split("\n").filter((l) => /resuming|export/i.test(l)).slice(-8);
    await a.close();
  }
  const folder = fs.readdirSync(saveDir)[0];
  const full = folder ? path.join(saveDir, folder) : null;
  r.afterResume = {
    folders: fs.readdirSync(saveDir),
    rows: full ? {
      videos: csvRows(full, "videos.csv"),
      comments: csvRows(full, "comments.csv"),
      transcripts: csvRows(full, "transcripts.csv"),
      status: csvRows(full, "video-status.csv"),
    } : null,
    summary: full ? fs.readFileSync(path.join(full, "summary.csv"), "utf8") : null,
    duplicateCommentRows: full ? (() => {
      const lines = fs.readFileSync(path.join(full, "comments.csv"), "utf8").split("\r\n").filter(Boolean).slice(1);
      const seen = new Map();
      for (const l of lines) seen.set(l, (seen.get(l) || 0) + 1);
      return [...seen.entries()].filter(([, c]) => c > 1).map(([l, c]) => `${c}x ${l.slice(0, 70)}`);
    })() : null,
    tmp: listTmp(),
  };

  // =====================================================================
  // b) clear the cache while an export is running
  // =====================================================================
  wipeTmp();
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
  {
    const a = await L.launchApp({ label: "t6-cacheclear", outDir, cwd: root, seed });
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });
    await a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]').fill(CHANNEL);
    await a.win.locator('input[type="number"]').fill("10");
    await a.win.locator('button:has-text("Export channel")').click();
    await a.win.waitForSelector('button:has-text("Stop")', { timeout: 10000 });
    await new Promise((res) => setTimeout(res, 12000));
    r.cacheClear = {};
    r.cacheClear.usageBefore = await L.api(a.win, "GET", "/api/cache/usage");
    r.cacheClear.cleared = await L.api(a.win, "POST", "/api/cache/clear", {});
    r.cacheClear.tmpAfterClear = listTmp();
    await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 180000 });
    r.cacheClear.result = await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Partial export saved|Export saved)[\s\S]{0,160}/);
      return m ? m[0] : null;
    });
    r.cacheClear.shot = await a.shot("after-cache-clear");
    await a.close();
  }
  {
    const f = fs.readdirSync(saveDir)[0];
    const d = f ? path.join(saveDir, f) : null;
    r.cacheClear.rows = d ? {
      videos: csvRows(d, "videos.csv"),
      comments: csvRows(d, "comments.csv"),
      transcripts: csvRows(d, "transcripts.csv"),
    } : null;
    r.cacheClear.summary = d ? fs.readFileSync(path.join(d, "summary.csv"), "utf8") : null;
  }

  // =====================================================================
  // c) two runs, same channel, same day, different parts
  // =====================================================================
  wipeTmp();
  fs.rmSync(saveDir, { recursive: true, force: true });
  fs.mkdirSync(saveDir, { recursive: true });
  L.writeStub(root, { ...SLOW, info, delayMs: 0 });
  {
    const a = await L.launchApp({ label: "t6-mixed", outDir, cwd: root, seed });
    await a.win.waitForSelector("header", { timeout: 20000 });
    await L.signIn(a);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector('button:has-text("Export channel")', { timeout: 15000 });
    const urlBox = a.win.locator('input[placeholder="https://www.youtube.com/@channelhandle"]');
    await urlBox.fill(CHANNEL);
    await a.win.locator('input[type="number"]').fill("10");
    // run 1: everything
    await a.win.locator('button:has-text("Export channel")').click();
    await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 180000 });
    const f1 = fs.readdirSync(saveDir)[0];
    r.mixed = { run1Folder: f1, run1Files: fs.readdirSync(path.join(saveDir, f1)) };
    await a.win.locator('button[aria-label="Dismiss"]').first().click();
    // run 2: transcripts only
    for (const label of ["Video details", "Comments"]) {
      const box = a.win.locator(`label:has-text("${label}") input[type="checkbox"]`).first();
      await box.uncheck();
    }
    r.mixed.shotRun2Form = await a.shot("run2-transcripts-only");
    await a.win.locator('button:has-text("Export channel")').click();
    await a.win.waitForSelector('text=/Export saved|Partial export saved/', { timeout: 180000 });
    r.mixed.run2Result = await a.win.evaluate(() => {
      const m = document.body.innerText.match(/(Partial export saved|Export saved)[\s\S]{0,160}/);
      return m ? m[0] : null;
    });
    r.mixed.shotRun2Done = await a.shot("run2-done");
    await a.close();
  }
  {
    r.mixed.folders = fs.readdirSync(saveDir);
    const d = path.join(saveDir, r.mixed.folders[0]);
    r.mixed.finalFiles = fs.readdirSync(d).map((n) => ({
      n, bytes: fs.statSync(path.join(d, n)).size, mtime: fs.statSync(path.join(d, n)).mtime.toISOString(),
    }));
    r.mixed.finalSummary = fs.readFileSync(path.join(d, "summary.csv"), "utf8");
    r.mixed.rows = {
      videos: csvRows(d, "videos.csv"),
      comments: csvRows(d, "comments.csv"),
      transcripts: csvRows(d, "transcripts.csv"),
    };
  }

  console.log(JSON.stringify(r, null, 2));
  L.save(outDir, "report.json", r);
})();
