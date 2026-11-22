#!/usr/bin/env node
/**
 * t11-edges.cjs — regressions near the fixes, and run-1 findings that were not
 * on the fix list, re-driven against the fixed tree.
 *
 *  A  the 409 lock: fresh:true, a different `deliver`, a different limit, and
 *     whether the slot is free again afterwards
 *  B  E-8 carry-over: a cancel that lands before the POST
 *  C  E-13 carry-over: a newline inside the url, and a 10k url
 *  D  E-12 carry-over: what the failure message looks like now that the panel
 *     redacts it
 *  E  E-14 carry-over: /tmp/ytchan-* output folders nobody collects
 *  F  the save folder disappearing between the run and export:save
 *  G  a details-only run's video-status.csv
 *
 * usage: xvfb-run -a ... node t11-edges.cjs <shape>
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");

const SHAPE = process.argv[2] || "owner-hash";
const ytchan = () => fs.readdirSync(os.tmpdir()).filter((n) => /^ytchan-/.test(n));

(async () => {
  const report = { shape: SHAPE, startedAt: new Date().toISOString() };
  const root = stubRoot("t11");
  setStub(root, { videos: 8, commentTexts: ["one"], commentDelayMs: 600, subDelayMs: 100 });
  const dataDir = fs.mkdtempSync("/tmp/r2e-data-t11-");

  const a = await launch({
    shape: SHAPE,
    label: `t11-${SHAPE}`,
    cwd: root,
    seed: { "clipper.dataDir": dataDir, "clipper.dataDirConfirmed": true, "clipper.clipsDir": dataDir, "clipper.saveDir": dataDir },
  });
  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    const skip = a.win.locator('button:has-text("Continue without signing in")');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await sleep(600);

    const body = (over = {}) => ({
      url: "https://www.youtube.com/@edges",
      contentType: "all",
      limit: 10,
      includeVideoDetails: true,
      includeComments: true,
      includeTranscripts: true,
      deliver: "path",
      ...over,
    });

    // ---- A: the 409 lock -------------------------------------------------
    report.A = await a.win.evaluate(async (b) => {
      const base = window.__API_BASE__;
      const post = (job, over) =>
        fetch(`${base}/api/channel/export?jobId=${job}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...b, ...over }),
        }).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 220) }));
      const running = post("A-running", {});
      await new Promise((r) => setTimeout(r, 1200));
      const sameFresh = await post("A-fresh", { fresh: true });
      const sameRows = await post("A-rows", { deliver: "rows" });
      const sameCookies = await post("A-cookie", { cookiesFromBrowser: "app" });
      const differentLimit = await post("A-diff", { limit: 11 });
      const first = await running;
      const afterFree = await post("A-again", {});
      return { sameFresh, sameRows, sameCookies, differentLimit, first, afterFree };
    }, body());
    report.A.wipAfter = fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("ytchanwip-"));

    // ---- B: E-8, a cancel that lands before the POST ---------------------
    report.B = await a.win.evaluate(async (b) => {
      const base = window.__API_BASE__;
      const jobId = "B-poisoned";
      const ctl = new AbortController();
      let sse = "closed";
      try {
        const r = await fetch(`${base}/api/channel/export/progress?jobId=${jobId}`, { signal: ctl.signal });
        sse = r.status === 200 ? "open" : `status ${r.status}`;
      } catch (e) {
        sse = String(e);
      }
      const cancelled = await fetch(`${base}/api/channel/export/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId }),
      }).then(async (r) => ({ status: r.status, body: await r.text() }));
      const exported = await fetch(`${base}/api/channel/export?jobId=${jobId}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...b, limit: 12 }),
      }).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 400) }));
      ctl.abort();
      const control = await fetch(`${base}/api/channel/export?jobId=B-clean`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...b, limit: 13 }),
      }).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 200) }));
      return { sse, cancelled, exported, control };
    }, body());

    // ---- C: E-13, malformed urls ----------------------------------------
    report.C = await a.win.evaluate(async (b) => {
      const base = window.__API_BASE__;
      const post = (url, job) =>
        fetch(`${base}/api/channel/export?jobId=${job}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...b, url, limit: 10, includeComments: false, includeTranscripts: false }),
        }).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 300) }));
      return {
        newlineInUrl: await post("https://www.youtube.com/@stub\nhttps://evil.invalid", "C-newline"),
        tenKUrl: await post("https://www.youtube.com/@" + "a".repeat(9980), "C-10k"),
        watchUrl: await post("https://www.youtube.com/watch?v=abc", "C-watch"),
        nonYouTube: await post("https://evil.example/@x", "C-evil"),
      };
    }, body());

    // ---- D: E-12, the failure message -----------------------------------
    report.D = {};
    {
      setStub(root, {
        exitCode: 1,
        stderr: "ERROR: [youtube:tab] @gone: YouTube said: This channel does not exist. Loading cookies from /home/sam/.config/clipper/yt-cookies.txt",
      });
      report.D.api = await a.win.evaluate(async (b) => {
        const base = window.__API_BASE__;
        const r = await fetch(`${base}/api/channel/export?jobId=D-gone`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...b, url: "https://www.youtube.com/@gone", includeComments: false, includeTranscripts: false }),
        });
        return { status: r.status, body: (await r.text()).slice(0, 500) };
      }, body());
      // and through the UI, so the redaction is exercised
      await a.win.click("#ui-channel-link");
      await a.win.waitForSelector("#ui-channel-start", { timeout: 15000 });
      await a.win.fill('input[placeholder="https://www.youtube.com/@channelhandle"]', "https://www.youtube.com/@gone");
      await a.win.fill('input[type="number"]', "10");
      await a.win.click("#ui-channel-start");
      const dl = Date.now() + 60000;
      while (Date.now() < dl) {
        const s = await a.win.evaluate(() => {
          const el = document.querySelector('[role="alert"]');
          return {
            running: Boolean(document.getElementById("ui-channel-stop")),
            alert: el ? el.textContent : null,
            urlStillInBox: (document.querySelector('input[placeholder="https://www.youtube.com/@channelhandle"]') || {}).value,
            canRetry: Boolean(document.getElementById("ui-channel-start")),
          };
        });
        if (!s.running && s.alert) {
          report.D.ui = s;
          break;
        }
        await sleep(250);
      }
      await a.shot("01-yt-dlp-failure");
      setStub(root, { exitCode: 0, stderr: "" });
    }

    // ---- E: orphaned output folders -------------------------------------
    report.E = { before: ytchan().length };
    report.E.run = await a.win.evaluate(async (b) => {
      const base = window.__API_BASE__;
      const r = await fetch(`${base}/api/channel/export?jobId=E-orphan`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...b, limit: 14, includeComments: false, includeTranscripts: false }),
      });
      const j = await r.json();
      return { status: r.status, dir: j.dir, files: (j.files || []).map((f) => f.name) };
    }, body());
    report.E.after = ytchan();
    report.E.orphanStillThere = report.E.run.dir ? fs.existsSync(report.E.run.dir) : null;
    report.E.usage = (await a.api("GET", "/api/cache/usage")).json;

    // ---- F: the save folder disappears before export:save ---------------
    {
      const gone = fs.mkdtempSync("/tmp/r2e-t11-gone-");
      await a.win.evaluate(async (d) => {
        await window.electronAPI.setSetting("clipper.dataDir", d);
      }, gone);
      report.F = { dataDirSetTo: gone };
      const run = await a.win.evaluate(async (b) => {
        const base = window.__API_BASE__;
        const r = await fetch(`${base}/api/channel/export?jobId=F-save`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ ...b, limit: 15, includeComments: false, includeTranscripts: false }),
        });
        const j = await r.json();
        return { status: r.status, dir: j.dir, files: (j.files || []).map((f) => ({ name: f.name, path: f.path })) };
      }, body());
      fs.rmSync(gone, { recursive: true, force: true });
      report.F.saveAfterFolderRemoved = await a.win.evaluate(
        async ([d, files]) => {
          try {
            return await window.electronAPI.saveExport({ dirPath: d, folder: "t11-F", files });
          } catch (e) {
            return { threw: String(e) };
          }
        },
        [gone, run.files],
      );
      report.F.run = run;
      report.F.recreated = fs.existsSync(gone) ? fs.readdirSync(gone) : null;
      report.F.tempStillThere = run.dir ? fs.existsSync(run.dir) : null;
    }

    // ---- G: a details-only run's video-status.csv -----------------------
    report.G = await a.win.evaluate(async (b) => {
      const base = window.__API_BASE__;
      const r = await fetch(`${base}/api/channel/export?jobId=G-details`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...b, limit: 16, includeComments: false, includeTranscripts: false }),
      });
      const j = await r.json();
      return { status: r.status, counts: j.counts, exported: j.channel && j.channel.exported, files: j.files };
    }, body());
    if (report.G.files) {
      report.G.onDisk = Object.fromEntries(
        report.G.files.map((f) => {
          try {
            const raw = fs.readFileSync(f.path, "utf8");
            return [f.name, { bytes: raw.length, rows: raw.replace(/^﻿/, "").split("\r\n").filter(Boolean).length - 1 }];
          } catch (e) {
            return [f.name, { error: String(e).slice(0, 50) }];
          }
        }),
      );
    }

    report.serverLog = a.logs.stdout.join("").split("\n").filter((l) => /channel|export|refus/i.test(l)).slice(-20);
  } catch (e) {
    report.fatal = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t11-${SHAPE}.json`, report);
    await a.close();
  }
})();
