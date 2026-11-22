#!/usr/bin/env node
/**
 * t6-e3-tabs.cjs — E-3 through the REAL UI, with two workspace tabs, which is
 * how run 1 reached it with no devtools at all.
 *
 * Each workspace tab mounts its own ChannelExportProvider (App.tsx: ChannelBoundary
 * inside the tab map), so the panel's "button disabled while exporting" guard
 * does not cross tabs.
 *
 * Phase A  two tabs, the SAME request        -> the second must be refused
 * Phase B  two tabs, DIFFERENT requests      -> both must run and both must be
 *                                               correct and complete
 * Phase C  cancel racing the refusal         -> the surviving run must be intact
 *                                               and the lock must be free after
 *
 * usage: xvfb-run -a ... node t6-e3-tabs.cjs <shape>
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");

const SHAPE = process.argv[2] || "owner-hash";

function wipDirs() {
  try {
    return fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("ytchanwip-"));
  } catch {
    return [];
  }
}
function readCsv(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw.replace(/^﻿/, "").split("\r\n").filter((l) => l.length);
    return { rows: lines.length - 1, bytes: raw.length, dupes: lines.length - 1 - new Set(lines.slice(1)).size };
  } catch (e) {
    return { error: String(e).slice(0, 60) };
  }
}
function folders(dataDir) {
  const out = {};
  for (const f of fs.readdirSync(dataDir)) {
    const dir = path.join(dataDir, f);
    out[f] = Object.fromEntries(fs.readdirSync(dir).map((n) => [n, readCsv(path.join(dir, n))]));
  }
  return out;
}

/** State of every mounted channel panel, tab by tab (document order). */
function panels(win) {
  return win.evaluate(() => {
    const tabs = [...document.querySelectorAll("#ui-channel-start, #ui-channel-stop")].map((el) => {
      const host = el.closest("div.absolute.inset-0") || el.closest("main")?.parentElement;
      const visible = el.getClientRects().length > 0;
      const panel = el.closest(".flex.min-w-0.flex-col") || el.parentElement;
      const text = panel ? panel.innerText : "";
      return {
        control: el.id,
        visible,
        exporting: el.id === "ui-channel-stop",
        phase: (text.match(/(Reading the channel list|Video details \d+ of \d+|Comments and transcripts, video \d+ of \d+)/) || [])[0] || null,
        result: (text.match(/(Export saved|Partial export saved)[^\n]*\n[^\n]*\n[^\n]*/) || [])[0] || null,
        alert: (() => {
          const al = panel ? panel.querySelector('[role="alert"]') : null;
          return al ? al.textContent : null;
        })(),
      };
    });
    return tabs;
  });
}

async function openChannelScreenOnVisibleTab(win) {
  await win.evaluate(() => {
    const links = [...document.querySelectorAll("#ui-channel-link")].filter((e) => e.getClientRects().length);
    if (links[0]) links[0].click();
  });
  await win.waitForFunction(
    () => [...document.querySelectorAll("#ui-channel-start,#ui-channel-stop")].some((e) => e.getClientRects().length),
    null,
    { timeout: 15000 },
  );
}

async function fillAndStartVisible(win, { url, limit }) {
  await win.evaluate(
    ([u, l]) => {
      const set = (el, v) => {
        const d = Object.getOwnPropertyDescriptor(el.constructor.prototype, "value");
        d.set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      const vis = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.getClientRects().length);
      const urlInput = vis('input[placeholder="https://www.youtube.com/@channelhandle"]')[0];
      set(urlInput, u);
      const num = vis('input[type="number"]')[0];
      if (num) set(num, String(l));
    },
    [url, limit],
  );
  await sleep(150);
  await win.evaluate(() => {
    const b = [...document.querySelectorAll("#ui-channel-start")].filter((e) => e.getClientRects().length)[0];
    if (b) b.click();
  });
}

(async () => {
  const report = { shape: SHAPE, startedAt: new Date().toISOString() };
  const root = stubRoot("t6");
  setStub(root, { videos: 6, commentTexts: ["one", "two"], commentDelayMs: 700, subDelayMs: 150 });
  const dataDir = fs.mkdtempSync("/tmp/r2e-data-t6-");
  const clipsDir = fs.mkdtempSync("/tmp/r2e-clips-t6-");

  const a = await launch({
    shape: SHAPE,
    label: `t6-${SHAPE}`,
    cwd: root,
    seed: {
      "clipper.dataDir": dataDir,
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": clipsDir,
      "clipper.saveDir": clipsDir,
    },
  });
  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    const skip = a.win.locator('button:has-text("Continue without signing in")');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await sleep(800);

    // ---- Phase A: two tabs, same request ---------------------------------
    await openChannelScreenOnVisibleTab(a.win);
    await fillAndStartVisible(a.win, { url: "https://www.youtube.com/@stubchannel", limit: 10 });
    await sleep(2500);
    report.A = { tabAStarted: await panels(a.win) };
    await a.shot("01-tabA-running");

    await a.win.click('button[aria-label="New tab"]');
    await sleep(900);
    await openChannelScreenOnVisibleTab(a.win);
    await fillAndStartVisible(a.win, { url: "https://www.youtube.com/@stubchannel", limit: 10 });
    await sleep(1800);
    report.A.bothPanels = await panels(a.win);
    report.A.wipDirs = wipDirs();
    await a.shot("02-both-tabs-same-request");

    report.A.final = await (async () => {
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        const p = await panels(a.win);
        if (p.length && p.every((x) => !x.exporting)) return p;
        await sleep(300);
      }
      return panels(a.win);
    })();
    await a.shot("03-both-tabs-finished");
    report.A.folders = folders(dataDir);
    report.A.wipAfter = wipDirs();

    // ---- Phase B: two tabs, DIFFERENT requests ---------------------------
    // Clear the result cards first so the next read is unambiguous.
    await a.win.evaluate(() => {
      for (const b of document.querySelectorAll('button[aria-label="Dismiss"]')) b.click();
    });
    const before = new Set(fs.readdirSync(dataDir));
    await fillAndStartVisible(a.win, { url: "https://www.youtube.com/@stubchannel", limit: 11 });
    await sleep(1200);
    // switch to the FIRST tab and start a different request there
    await a.win.evaluate(() => {
      const t = document.querySelectorAll('[role="tab"]');
      if (t[0]) t[0].click();
    });
    await sleep(600);
    await fillAndStartVisible(a.win, { url: "https://www.youtube.com/@stubchannel", limit: 12 });
    await sleep(2000);
    report.B = { both: await panels(a.win), wipDirs: wipDirs() };
    await a.shot("04-two-different-exports");
    report.B.final = await (async () => {
      const deadline = Date.now() + 180000;
      while (Date.now() < deadline) {
        const p = await panels(a.win);
        if (p.length && p.every((x) => !x.exporting)) return p;
        await sleep(300);
      }
      return panels(a.win);
    })();
    await a.shot("05-two-different-finished");
    const after = fs.readdirSync(dataDir).filter((f) => !before.has(f));
    report.B.newFolders = after;
    report.B.folders = Object.fromEntries(
      after.map((f) => [
        f,
        Object.fromEntries(fs.readdirSync(path.join(dataDir, f)).map((n) => [n, readCsv(path.join(dataDir, f, n))])),
      ]),
    );

    // ---- Phase C: cancel racing the 409, over HTTP (precise timing) -----
    report.C = await a.win.evaluate(async () => {
      const base = window.__API_BASE__;
      const body = (limit) => ({
        url: "https://www.youtube.com/@stubchannel",
        contentType: "all",
        limit,
        includeVideoDetails: true,
        includeComments: true,
        includeTranscripts: true,
        deliver: "path",
      });
      const post = (jobId, limit) =>
        fetch(`${base}/api/channel/export?jobId=${jobId}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body(limit)),
        }).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 400) }));

      const first = post("r2e-C-first", 13);
      await new Promise((r) => setTimeout(r, 900));
      const second = await post("r2e-C-second", 13); // identical request -> expect 409
      // cancel the FIRST while the duplicate refusal has just landed
      const cancelled = await fetch(`${base}/api/channel/export/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId: "r2e-C-first" }),
      }).then(async (r) => ({ status: r.status, body: await r.text() }));
      const firstRes = await first;
      // the lock must be free now: a third identical request must be accepted
      const third = await post("r2e-C-third", 13);
      return { second, cancelled, firstRes, third };
    });
    report.C.wipAfter = wipDirs();

    report.serverLog = a.logs.stdout.join("").split("\n").filter((l) => /channel|export/i.test(l)).slice(-20);
  } catch (e) {
    report.fatal = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t6-${SHAPE}.json`, report);
    await a.close();
  }
})();
