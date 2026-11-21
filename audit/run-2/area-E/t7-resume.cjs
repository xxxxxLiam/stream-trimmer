#!/usr/bin/env node
/**
 * t7-resume.cjs — resume after SIGKILL with the NEW checkpoint prefix and the
 * in-use hold in place, and what the crashed run leaves behind.
 *
 *  1. Start a slow export through the real UI, reach video 4 of 10, SIGKILL the
 *     whole app.
 *  2. Read the ytchanwip- checkpoint off disk.
 *  3. Is that orphaned folder visible to the product's own disk tools
 *     (GET /api/cache/usage) and removable by "Clear unfinished"
 *     (POST /api/cache/clear)? It has the new prefix, which resumeCache no
 *     longer matches.
 *  4. Relaunch, press Export with the same settings and "Start over" unticked.
 *     The run must resume, finish complete, and contain no duplicate rows.
 *  5. Is the resume visible to the user anywhere?
 *
 * usage: xvfb-run -a ... node t7-resume.cjs <shape>
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");

const SHAPE = process.argv[2] || "owner-hash";

function wipSnapshot() {
  const out = {};
  for (const n of fs.readdirSync(os.tmpdir())) {
    if (!n.startsWith("ytchanwip-")) continue;
    const dir = path.join(os.tmpdir(), n);
    try {
      out[n] = {
        bytes: fs.readdirSync(dir).reduce((s, f) => s + fs.statSync(path.join(dir, f)).size, 0),
        files: Object.fromEntries(
          fs.readdirSync(dir).map((f) => {
            const p = path.join(dir, f);
            let lines = null;
            try {
              lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean).length;
            } catch {
              /* ignore */
            }
            return [f, lines];
          }),
        ),
      };
    } catch {
      /* gone */
    }
  }
  return out;
}
function readCsv(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw.replace(/^﻿/, "").split("\r\n").filter((l) => l.length);
    const data = lines.slice(1);
    return { rows: data.length, duplicateRows: data.length - new Set(data).size };
  } catch (e) {
    return { error: String(e).slice(0, 60) };
  }
}
function folders(dataDir) {
  return Object.fromEntries(
    fs.readdirSync(dataDir).map((f) => [
      f,
      Object.fromEntries(fs.readdirSync(path.join(dataDir, f)).map((n) => [n, readCsv(path.join(dataDir, f, n))])),
    ]),
  );
}
async function uiState(win) {
  return win.evaluate(() => {
    const t = document.body.innerText;
    return {
      running: Boolean(document.getElementById("ui-channel-stop")),
      phase: (t.match(/(Reading the channel list|Video details \d+ of \d+|Comments and transcripts, video \d+ of \d+)/) || [])[0] || null,
      label: (() => {
        const el = [...document.querySelectorAll(".text-meta.text-fg-dim")].map((e) => e.textContent).filter(Boolean);
        return el.slice(0, 4);
      })(),
      resumeNotice: /Resuming|already collected|resum/i.test(t),
      result: (t.match(/(Export saved|Partial export saved)[\s\S]{0,140}/) || [])[0] || null,
      alert: (() => {
        const el = document.querySelector('[role="alert"]');
        return el ? el.textContent : null;
      })(),
    };
  });
}

(async () => {
  const report = { shape: SHAPE, startedAt: new Date().toISOString() };
  const root = stubRoot("t7");
  setStub(root, { videos: 10, commentTexts: ["one"], commentDelayMs: 1200, subDelayMs: 300, metaDelayMs: 20 });
  const dataDir = fs.mkdtempSync("/tmp/r2e-data-t7-");
  const clipsDir = fs.mkdtempSync("/tmp/r2e-clips-t7-");
  const seed = {
    "clipper.dataDir": dataDir,
    "clipper.dataDirConfirmed": true,
    "clipper.clipsDir": clipsDir,
    "clipper.saveDir": clipsDir,
  };

  // ---------- run 1: start, then SIGKILL --------------------------------
  const a = await launch({ shape: SHAPE, label: `t7-${SHAPE}-kill`, cwd: root, seed });
  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    const skip = a.win.locator('button:has-text("Continue without signing in")');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await sleep(800);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector("#ui-channel-start", { timeout: 20000 });
    await a.win.fill('input[placeholder="https://www.youtube.com/@channelhandle"]', "https://www.youtube.com/@killme");
    await a.win.fill('input[type="number"]', "10");
    await a.win.click("#ui-channel-start");

    const deadline = Date.now() + 90000;
    while (Date.now() < deadline) {
      const s = await uiState(a.win);
      const m = /video (\d+) of/.exec(s.phase || "");
      if (m && Number(m[1]) >= 4) {
        report.atKill = s;
        break;
      }
      if (!s.running) {
        report.atKill = { finishedEarly: true, ...s };
        break;
      }
      await sleep(200);
    }
    await a.shot("01-before-kill");
    report.beforeKill = { wip: wipSnapshot(), dataDir: fs.readdirSync(dataDir) };
    a.app.process().kill("SIGKILL");
  } catch (e) {
    report.fatal1 = String(e && e.stack ? e.stack : e);
    try {
      a.app.process().kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
  await sleep(2500);
  report.afterKill = { wip: wipSnapshot(), dataDir: fs.readdirSync(dataDir) };

  // ---------- run 2: relaunch, probe the disk tools, then resume --------
  const b = await launch({ shape: SHAPE, label: `t7-${SHAPE}-resume`, cwd: root, seed });
  try {
    await b.win.waitForSelector("header", { timeout: 30000 });
    const skip2 = b.win.locator('button:has-text("Continue without signing in")');
    if (await skip2.count()) await skip2.first().click().catch(() => {});
    await sleep(800);

    // 3. Can the user see or reclaim the crashed run's working folder?
    const wipBytes = Object.values(report.afterKill.wip).reduce((s, v) => s + v.bytes, 0);
    report.diskTools = {
      orphanedCheckpointBytes: wipBytes,
      usage: (await b.api("GET", "/api/cache/usage")).json,
      clear: (await b.api("POST", "/api/cache/clear", {})).json,
      wipAfterClear: wipSnapshot(),
    };

    // 4. Resume.
    await b.win.click("#ui-channel-link");
    await b.win.waitForSelector("#ui-channel-start", { timeout: 20000 });
    await b.win.fill('input[placeholder="https://www.youtube.com/@channelhandle"]', "https://www.youtube.com/@killme");
    await b.win.fill('input[type="number"]', "10");
    setStub(root, { commentDelayMs: 150, subDelayMs: 50 });
    await b.win.click("#ui-channel-start");

    // sample the UI densely, looking for any sign of the resume
    const samples = [];
    const dl = Date.now() + 180000;
    let last = null;
    while (Date.now() < dl) {
      const s = await uiState(b.win);
      samples.push({ t: Date.now(), phase: s.phase, resumeNotice: s.resumeNotice, label: s.label });
      last = s;
      if (!s.running && (s.result || s.alert)) break;
      await sleep(120);
    }
    report.resume = {
      finalUi: last,
      sawResumeNotice: samples.some((s) => s.resumeNotice),
      firstPhases: samples.slice(0, 12).map((s) => s.phase),
      samples: samples.length,
    };
    await b.shot("02-resume-done");
    report.resume.folders = folders(dataDir);
    report.resume.serverLog = b.logs.stdout.join("").split("\n").filter((l) => /resum|channel|export/i.test(l)).slice(-12);
    report.resume.wipAfter = wipSnapshot();
  } catch (e) {
    report.fatal2 = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t7-${SHAPE}.json`, report);
    await b.close();
  }
})();
