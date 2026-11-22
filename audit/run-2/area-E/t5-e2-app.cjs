#!/usr/bin/env node
/**
 * t5-e2-app.cjs — E-2 in the running app, plus the "folder removed mid-run"
 * regression the fix's own error path is supposed to catch.
 *
 * Phase 1  Clear the cache mid-export, through the real endpoint the Settings
 *          button calls. The run must finish with its comments and transcripts
 *          intact (or fail loudly) — never "Export saved" with 0 rows.
 * Phase 2  Delete the live checkpoint folder from outside the process, which
 *          defeats BOTH protections at once. The run must stop and say nothing
 *          was saved, and must not strand partial CSVs in the data folder.
 * Phase 3  The progress endpoint after completion, and after the 5 s cleanup.
 *
 * NOTE: POST /api/cache/clear is global over the OS temp dir by design. Folders
 * another job is using are skipped (resumeCache.isProtected), so live work
 * elsewhere is protected by the product's own rule; abandoned leftovers are not.
 *
 * usage: xvfb-run -a ... node t5-e2-app.cjs <shape>
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");

const SHAPE = process.argv[2] || "owner-hash";

function wipDirs() {
  try {
    return fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("ytchanwip-")).map((n) => path.join(os.tmpdir(), n));
  } catch {
    return [];
  }
}
function dirSnapshot(dir) {
  try {
    return Object.fromEntries(
      fs.readdirSync(dir).map((f) => {
        const p = path.join(dir, f);
        let lines = null;
        try {
          lines = fs.readFileSync(p, "utf8").split("\n").filter(Boolean).length;
        } catch {
          /* ignore */
        }
        return [f, { bytes: fs.statSync(p).size, lines }];
      }),
    );
  } catch {
    return null;
  }
}
function readCsv(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw.replace(/^﻿/, "").split("\r\n").filter((l) => l.length);
    return { bytes: raw.length, rows: lines.length - 1, first: lines[1] ?? null };
  } catch (e) {
    return { error: String(e).slice(0, 80) };
  }
}
function folderReport(dataDir) {
  const out = {};
  for (const f of fs.readdirSync(dataDir)) {
    const dir = path.join(dataDir, f);
    out[f] = {};
    for (const n of fs.readdirSync(dir)) out[f][n] = readCsv(path.join(dir, n));
  }
  return out;
}

async function uiState(win) {
  return win.evaluate(() => {
    const text = document.body.innerText;
    return {
      running: Boolean(document.getElementById("ui-channel-stop")),
      phase: (text.match(/(Reading the channel list|Video details \d+ of \d+|Comments and transcripts, video \d+ of \d+)/) || [])[0] || null,
      resultLine: (text.match(/(Export saved|Partial export saved)[\s\S]{0,120}/) || [])[0] || null,
      alert: (() => {
        const el = document.querySelector('[role="alert"]');
        return el ? el.textContent : null;
      })(),
    };
  });
}

async function startAndWaitForDetails(a, opts) {
  await a.win.fill('input[placeholder="https://www.youtube.com/@channelhandle"]', opts.url);
  await a.win.fill('input[type="number"]', String(opts.limit));
  if (opts.fresh) {
    const box = a.win.locator('label:has-text("Start over") input[type="checkbox"]').first();
    if (!(await box.isChecked())) await box.check();
  }
  await a.win.click("#ui-channel-start");
  const deadline = Date.now() + 90000;
  while (Date.now() < deadline) {
    const s = await uiState(a.win);
    if (s.phase && /Comments and transcripts, video (\d+) of/.test(s.phase)) {
      const n = Number(/video (\d+) of/.exec(s.phase)[1]);
      if (n >= (opts.waitVideo || 3)) return s;
    }
    if (!s.running) return s;
    await sleep(200);
  }
  return uiState(a.win);
}

async function waitDone(a, ms = 180000) {
  const deadline = Date.now() + ms;
  let s = null;
  while (Date.now() < deadline) {
    s = await uiState(a.win);
    if (!s.running && (s.resultLine || s.alert)) return s;
    await sleep(250);
  }
  return s;
}

(async () => {
  const report = { shape: SHAPE, startedAt: new Date().toISOString() };
  const root = stubRoot("t5");
  setStub(root, {
    videos: 10,
    commentTexts: ["one", "two", "three"],
    commentDelayMs: 500,
    subDelayMs: 150,
    metaDelayMs: 30,
  });
  const dataDir = fs.mkdtempSync("/tmp/r2e-data-t5-");
  const clipsDir = fs.mkdtempSync("/tmp/r2e-clips-t5-");

  const a = await launch({
    shape: SHAPE,
    label: `t5-${SHAPE}`,
    cwd: root,
    seed: {
      "clipper.dataDir": dataDir,
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": clipsDir,
      "clipper.saveDir": clipsDir,
    },
  });
  try {
    // get past the sign-in gate with the product's own skip button
    await a.win.waitForSelector("header", { timeout: 30000 });
    const skip = a.win.locator('button:has-text("Continue without signing in")');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await sleep(800);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector("#ui-channel-start", { timeout: 20000 });

    // ---------------- phase 1: Clear cache mid-export -------------------
    report.phase1 = {};
    report.phase1.atDetails = await startAndWaitForDetails(a, { url: "https://www.youtube.com/@stubchannel", limit: 10, waitVideo: 3 });
    report.phase1.wipBefore = wipDirs().map((d) => ({ dir: d, files: dirSnapshot(d) }));
    report.phase1.usageBefore = await a.api("GET", "/api/cache/usage");
    await a.shot("01-mid-export");
    report.phase1.clear = await a.api("POST", "/api/cache/clear", {});
    report.phase1.wipAfterClear = wipDirs().map((d) => ({ dir: d, files: dirSnapshot(d) }));
    await a.shot("02-after-cache-clear");
    report.phase1.done = await waitDone(a);
    await a.shot("03-phase1-done");
    report.phase1.folders = folderReport(dataDir);

    // ---------------- phase 2: the checkpoint folder is deleted ---------
    report.phase2 = {};
    await a.win.click('button[aria-label="Dismiss"]').catch(() => {});
    report.phase2.atDetails = await startAndWaitForDetails(a, {
      url: "https://www.youtube.com/@stubchannel2",
      limit: 10,
      waitVideo: 3,
      fresh: true,
    });
    const live = wipDirs();
    report.phase2.wipBefore = live.map((d) => ({ dir: d, files: dirSnapshot(d) }));
    for (const d of live) fs.rmSync(d, { recursive: true, force: true });
    report.phase2.removed = live;
    await a.shot("04-checkpoint-deleted");
    report.phase2.done = await waitDone(a);
    await a.shot("05-phase2-done");
    report.phase2.foldersAfter = fs.readdirSync(dataDir);
    report.phase2.folders = folderReport(dataDir);

    // ---------------- phase 3: progress after completion ----------------
    const jobId = "t5-finished-job";
    report.phase3 = {};
    report.phase3.exportWithKnownJob = await a.api(
      "POST",
      `/api/channel/export?jobId=${jobId}`,
      { url: "https://www.youtube.com/@stubchannel3", limit: 10, deliver: "path", includeComments: false, includeTranscripts: false },
    );
    report.phase3.progressImmediately = await a.win.evaluate(
      async ([jid]) => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 2500);
        try {
          const r = await fetch(`${window.__API_BASE__}/api/channel/export/progress?jobId=${jid}`, { signal: ctl.signal });
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          const { value } = await reader.read();
          ctl.abort();
          return { status: r.status, ct: r.headers.get("content-type"), frame: dec.decode(value) };
        } catch (e) {
          return { error: String(e) };
        } finally {
          clearTimeout(t);
        }
      },
      [jobId],
    );
    await sleep(7000);
    report.phase3.progressAfterCleanup = await a.win.evaluate(
      async ([jid]) => {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 2500);
        try {
          const r = await fetch(`${window.__API_BASE__}/api/channel/export/progress?jobId=${jid}`, { signal: ctl.signal });
          const reader = r.body.getReader();
          const dec = new TextDecoder();
          const { value } = await reader.read();
          ctl.abort();
          return { status: r.status, frame: dec.decode(value) };
        } catch (e) {
          return { error: String(e) };
        } finally {
          clearTimeout(t);
        }
      },
      [jobId],
    );
    report.phase3.progressNeverExisted = await a.win.evaluate(async () => {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 2500);
      try {
        const r = await fetch(`${window.__API_BASE__}/api/channel/export/progress?jobId=pure-fiction-r2`, { signal: ctl.signal });
        const reader = r.body.getReader();
        const dec = new TextDecoder();
        const { value } = await reader.read();
        ctl.abort();
        return { status: r.status, frame: dec.decode(value) };
      } catch (e) {
        return { error: String(e) };
      } finally {
        clearTimeout(t);
      }
    });

    report.serverLog = a.logs.stdout.join("").split("\n").filter((l) => /channel|cache|export/i.test(l)).slice(-25);
  } catch (e) {
    report.fatal = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t5-${SHAPE}.json`, report);
    await a.close();
  }
})();
