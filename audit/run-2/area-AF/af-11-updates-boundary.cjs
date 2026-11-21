#!/usr/bin/env node
/**
 * AF-11 — F-9 (update-check honesty), F-10 (the error boundary, exercised with
 * a REAL render throw) and item 12 (a 499 cancel must be quiet).
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, jar, AUTH_TEXT } = require("./lib.cjs");

const R = {};
const CLIPS = "/tmp/af-clips-11";
const CAMPAIGN = {
  id: "camp_af11", name: "Audit AF", targetMinSec: 1, targetMaxSec: 600, hardMaxSec: 900,
  clipIdPattern: "{prefix}-{videoId}-{nn}", prefix: "AF", format: "mp4", quality: "360",
  clipsDir: CLIPS, dataDir: "/tmp/af-data-11", usedRanges: {},
};
const SEED = {
  "clipper.dataDirConfirmed": true,
  "clipper.campaigns": [CAMPAIGN],
  "clipper.activeCampaign": "camp_af11",
  "clipper.clipsDir": CLIPS, "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS],
  "clipper.workspaces": {
    tabs: [{ id: "ws1", name: "", url: "https://www.youtube.com/watch?v=stub0000001" }],
    activeId: "ws1",
  },
};

const send = (a, payload) =>
  a.app.evaluate(({ BrowserWindow }, p) => {
    for (const w of BrowserWindow.getAllWindows()) w.webContents.send("updater:status", p);
  }, payload);

const strip = `(() => {
  const hdr = document.querySelector("header");
  const t = hdr ? hdr.innerText.replace(/\\s+/g," ") : null;
  return { headerText: t, bodyLen: document.body.innerText.length };
})()`;

async function main() {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  writeStub({
    auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
    subs: {}, infoStage: {}, downloadStage: {},
  });

  // ---------------- F-9: a real "Check for updates" -----------------------
  {
    const a = await launch({ label: "af-11-f9", cookieFile: jar(), seed: SEED });
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(2500);
    const handlerAnswer = await a.win.evaluate(() => window.electronAPI.checkForUpdates());
    R.f9_handlerAnswer = handlerAnswer;
    await a.win.locator("header button", { hasText: "Check" }).first().click();
    const samples = [];
    for (let i = 0; i < 24; i++) {
      await a.win.waitForTimeout(500);
      samples.push(
        await a.win.evaluate(() => {
          const spans = Array.from(document.querySelectorAll("header span"));
          const s = spans.find((e) =>
            /Checking for updates|Up to date|Update check failed|Downloading update|Update ready|Update .* available/.test(
              e.textContent || "",
            ),
          );
          return s ? { text: s.textContent.trim(), title: s.getAttribute("title") } : null;
        }),
      );
    }
    R.f9_samples = samples.filter(Boolean).filter((v, i, arr) => i === 0 || JSON.stringify(v) !== JSON.stringify(arr[i - 1]));
    R.f9_saidUpToDate = samples.some((s) => s && /Up to date/.test(s.text));
    R.f9_saidFailed = samples.some((s) => s && /failed/.test(s.text));
    R.f9_shot = await a.shot("after-check-for-updates");
    const log = path.join(a.userDataDir, "logs", "main.log");
    R.f9_logLines = fs.existsSync(log)
      ? fs.readFileSync(log, "utf8").split("\n").filter((l) => /updater/i.test(l)).slice(-8)
      : [];
    await a.close();
  }

  // ---------------- F-10: a real render throw ------------------------------
  {
    const a = await launch({ label: "af-11-boundary", cookieFile: jar(), seed: SEED });
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(2500);
    R.b_before = await a.win.evaluate(strip);
    const errsBefore = a.logs.pageErrors.length;
    await send(a, null);
    await a.win.waitForTimeout(1500);
    R.b_pageErrorsRaised = a.logs.pageErrors.length - errsBefore;
    R.b_pageError = (a.logs.pageErrors[a.logs.pageErrors.length - 1] || "").split("\n")[0];
    R.b_after = await a.win.evaluate(() => ({
      blank: document.body.innerText.trim().length === 0,
      bodyText: document.body.innerText.replace(/\s+/g, " ").slice(0, 300),
      boundaryShown: !!document.querySelector("#ui-error-retry"),
      buttons: Array.from(document.querySelectorAll("button")).map((b) => b.textContent.trim()),
      pre: document.querySelector("pre")?.textContent?.slice(0, 160) || null,
      headerStillThere: !!document.querySelector("header"),
    }));
    R.b_shot = await a.shot("error-boundary");
    // recovery
    if (R.b_after.boundaryShown) {
      await a.win.click("#ui-error-retry");
      await a.win.waitForTimeout(2500);
      R.b_afterRetry = await a.win.evaluate(() => ({
        boundaryShown: !!document.querySelector("#ui-error-retry"),
        headerBack: !!document.querySelector("header"),
        markBarBack: !!document.getElementById("ui-mark-in"),
        bodyLen: document.body.innerText.length,
      }));
      R.b_shotRetry = await a.shot("after-try-again");
    }
    // a second, independent throw and the Reload route
    await send(a, null);
    await a.win.waitForTimeout(1200);
    R.b_secondThrowCaught = await a.win.evaluate(() => !!document.querySelector("#ui-error-reload"));
    if (R.b_secondThrowCaught) {
      await a.win.click("#ui-error-reload");
      await a.win.waitForTimeout(6000);
      R.b_afterReload = await a.win.evaluate(() => ({
        boundaryShown: !!document.querySelector("#ui-error-retry"),
        markBarBack: !!document.getElementById("ui-mark-in"),
      }));
      R.b_shotReload = await a.shot("after-reload");
    }

    // F-12, adjacent: the percent is still interpolated raw
    await a.win.waitForTimeout(500);
    for (const p of [-1, 999, NaN]) {
      await send(a, { state: "downloading", percent: p });
      await a.win.waitForTimeout(500);
      const t = await a.win.evaluate(() => {
        const s = Array.from(document.querySelectorAll("header span")).find((e) =>
          /Downloading update/.test(e.textContent || ""),
        );
        return s ? s.textContent.trim() : null;
      });
      (R.f12 ||= []).push({ sent: String(p), shown: t });
    }
    await a.close();
  }

  // ---------------- item 12: a 499 cancel must be quiet -------------------
  {
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      subs: {}, infoStage: {},
      downloadStage: { exitCode: 0, delayMs: 15000 },
    });
    const a = await launch({ label: "af-11-cancel", cookieFile: jar(), seed: SEED });
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(2500);
    // audit scaffolding inside the page: record the URLs the product fetches,
    // so the job id can be read without touching product code.
    await a.win.evaluate(() => {
      window.__afUrls = [];
      const f = window.fetch;
      window.fetch = (...args) => {
        try { window.__afUrls.push(String(args[0])); } catch {}
        return f(...args);
      };
    });
    await a.win.fill("#ui-mark-in", "00:00:02");
    await a.win.fill("#ui-mark-out", "00:00:08");
    await a.win.waitForTimeout(300);
    await a.win.evaluate(() => document.getElementById("ui-cut")?.scrollIntoView({ block: "center" }));
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(3000);
    R.c_downloading = await a.win.evaluate(() => /Downloading|Finishing/.test(document.body.innerText));
    R.c_jobId = await a.win.evaluate(() => {
      const u = (window.__afUrls || []).find((x) => /\/api\/download\?/.test(x));
      return u ? new URL(u).searchParams.get("jobId") : null;
    });
    // cancel on the ENGINE only — the product's own fetch stays open, so the
    // renderer really receives the 499 instead of an abort.
    R.c_cancelResponse = await a.win.evaluate(async (jobId) => {
      const r = await fetch(`${window.__API_BASE__}/api/download/cancel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jobId }),
      });
      return { status: r.status, body: (await r.text()).slice(0, 120) };
    }, R.c_jobId);
    await a.win.waitForTimeout(8000);
    R.c_after = await a.win.evaluate(() => ({
      alerts: Array.from(document.querySelectorAll('[role="alert"]')).map((e) =>
        e.textContent.replace(/\s+/g, " ").trim().slice(0, 200),
      ),
      copyDiagnostics: Array.from(document.querySelectorAll("button")).some((b) =>
        /Copy diagnostics/.test(b.textContent || ""),
      ),
      status: Array.from(document.querySelectorAll('[role="status"]')).map((e) =>
        e.textContent.replace(/\s+/g, " ").trim().slice(0, 120),
      ).filter(Boolean),
      stillDownloading: /Downloading \d|Finishing up/.test(document.body.innerText),
    }));
    R.c_shot = await a.shot("after-499-cancel");
    await a.close();
  }

  fs.writeFileSync(path.join(__dirname, "out", "af-11.json"), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
