#!/usr/bin/env node
/**
 * E-2, E-3, E-5, E-8 verification, from their Steps. My own scripts, against
 * my own owner build (/tmp/s4-owner-star) and my own scriptable yt-dlp.
 *
 * E-2  "Clear cache" during an export empties comments.csv and transcripts.csv
 *      and the run still reports success, with a lying summary.csv.
 * E-3  two exports at once corrupt each other (duplicated rows one side,
 *      header-only CSVs the other), both claiming success.
 * E-5  re-exporting the same channel the same day merges two runs into one
 *      folder and summary.csv describes only the newer one.
 * E-8  a cancel that lands between the SSE open and the POST poisons the next
 *      export into a silent empty success.
 *
 * E-2 and E-5 are driven through the real UI (the panel, the Export button,
 * the result card, saveExport into the campaign's data folder) because the
 * claims are partly about what the UI says. E-3 and E-8 are driven at the API,
 * which is what their Steps specify.
 *
 * usage: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-e2-e3-e5-e8.cjs [run]
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, api, cookieTxt, SIGNED_IN_STDERR } = require("./lib.cjs");
const { makeStub, writeCfg } = require("./mkstub.cjs");

const RUN = process.argv[2] || "1";
const STUB = `/tmp/s4-stub-e-${RUN}`;
const DATA = `/tmp/s4-e-data-${RUN}`;
const MIRROR = "/tmp/s4-owner-star";

const SIGNED_IN = { exitCode: 0, stdout: SIGNED_IN_STDERR };

const seedFor = (dataDir) => ({
  "clipper.dataDirConfirmed": true,
  "clipper.authSource": "app",
  "clipper.clipsDir": `${dataDir}/clips`,
  "clipper.dataDir": dataDir,
  "clipper.campaigns": [
    { id: "camp1", name: "Campaign One", clipsDir: `${dataDir}/clips`, dataDir },
  ],
  "clipper.activeCampaign": "camp1",
});

const ytchanDirs = () =>
  fs
    .readdirSync(os.tmpdir())
    .filter((n) => n.startsWith("ytchan-"))
    .map((n) => path.join(os.tmpdir(), n));

function readCsv(file) {
  if (!fs.existsSync(file)) return { missing: true };
  const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "");
  const lines = raw.split(/\r?\n/).filter((l) => l.length > 0);
  return {
    bytes: fs.statSync(file).size,
    header: lines[0] ?? null,
    dataRows: Math.max(0, lines.length - 1),
    firstRows: lines.slice(1, 6),
  };
}

function folderListing(dir) {
  if (!fs.existsSync(dir)) return { missing: true };
  const out = {};
  for (const f of fs.readdirSync(dir)) {
    const st = fs.statSync(path.join(dir, f));
    if (st.isDirectory()) { out[f] = "<dir>"; continue; }
    out[f] = { bytes: st.size, mtime: new Date(st.mtimeMs).toISOString().slice(11, 23) };
  }
  return out;
}

async function openChannelScreen(a) {
  await a.win.waitForSelector("#ui-channel-link", { timeout: 30000 });
  await a.win.click("#ui-channel-link");
  await a.win.waitForSelector('input[placeholder="https://www.youtube.com/@channelhandle"]', {
    timeout: 15000,
  });
}

async function setParts(win, { videoDetails, comments, transcripts }) {
  await win.evaluate(
    (want) => {
      const boxes = Array.from(document.querySelectorAll('input[type="checkbox"]'));
      // The first three checkboxes in the panel are the three parts, in order
      // (video details, comments, transcripts); the fourth is "Start over".
      const labels = boxes.map((b) => (b.closest("label")?.textContent || "").trim());
      const pick = (re) => boxes[labels.findIndex((l) => re.test(l))];
      const set = (box, on) => {
        if (box && box.checked !== on) box.click();
      };
      set(pick(/^Video details/), want.videoDetails);
      set(pick(/^Comments/), want.comments);
      set(pick(/^Transcript/i), want.transcripts);
    },
    { videoDetails, comments, transcripts },
  );
  await win.waitForTimeout(300);
}

const panelState = (win) =>
  win.evaluate(() => {
    const txt = (sel) => document.querySelector(sel)?.textContent?.trim() ?? null;
    const body = document.body.textContent || "";
    return {
      progressLabel:
        Array.from(document.querySelectorAll("span,div"))
          .map((e) => (e.textContent || "").trim())
          .find((t) => /^(Reading the channel listing|Video details|Comments and transcripts|Skipping)/.test(t)) ?? null,
      resultHeadline: /Export saved/.test(body)
        ? "Export saved"
        : /Partial export saved/.test(body)
          ? "Partial export saved"
          : null,
      resultDetail:
        Array.from(document.querySelectorAll("span"))
          .map((e) => (e.textContent || "").trim())
          .find((t) => /\d+ videos/.test(t)) ?? null,
      errorBanner: txt('[role="alert"]'),
      exporting: !document.querySelector('button:not([disabled])') ? null : /Stop/.test(body),
    };
  });

(async () => {
  const report = { run: RUN };
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(DATA, { recursive: true });

  /* ============================== E-2 ============================== */
  {
    makeStub(STUB, {
      auth: { default: SIGNED_IN, app: SIGNED_IN },
      channel: { videos: 10, commentsPerVideo: 1, captionLines: 1, delayMs: 700, name: "Stub Channel" },
    });
    const dataDir = path.join(DATA, "e2");
    fs.mkdirSync(dataDir, { recursive: true });
    for (const d of ytchanDirs()) fs.rmSync(d, { recursive: true, force: true });
    const a = await launch({
      mirror: MIRROR,
      label: `e2-${RUN}`,
      cwd: STUB,
      cookieFile: cookieTxt(),
      seed: seedFor(dataDir),
    });
    const r = {};
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(3000);
      await openChannelScreen(a);
      await a.win.fill('input[placeholder="https://www.youtube.com/@channelhandle"]', "https://www.youtube.com/@stubchannel");
      await setParts(a.win, { videoDetails: true, comments: true, transcripts: true });
      // limit 10
      await a.win.evaluate(() => {
        const n = document.querySelector('input[type="number"]');
        if (n) {
          n.focus();
          n.value = "";
        }
      });
      await a.win.fill('input[type="number"]', "10").catch(() => {});
      await a.win.click('button:has-text("Export channel")', { timeout: 10000 });
      // Wait until the per-video phase is under way.
      await a.win.waitForFunction(
        () => /Comments and transcripts, video \d+ of 10/.test(document.body.textContent || ""),
        { timeout: 90000 },
      );
      r.usageBefore = await api(a.win, "GET", "/api/cache/usage").then((x) => x.json);
      r.ytchanBefore = ytchanDirs().map((d) => path.basename(d));
      r.phaseAtClear = await a.win.evaluate(
        () => (document.body.textContent || "").match(/Comments and transcripts, video \d+ of 10/)?.[0] ?? null,
      );
      r.clear = await api(a.win, "POST", "/api/cache/clear").then((x) => x.json);
      r.shotAfterClear = await a.shot("after-cache-clear");
      // Let the export finish.
      await a.win.waitForFunction(
        () => /Export saved|Partial export saved/.test(document.body.textContent || "") ||
          Boolean(document.querySelector('[role="alert"]')),
        { timeout: 180000 },
      );
      await a.win.waitForTimeout(1500);
      r.panel = await panelState(a.win);
      r.shotDone = await a.shot("e2-done");
      const folder = fs
        .readdirSync(dataDir)
        .filter((f) => fs.statSync(path.join(dataDir, f)).isDirectory());
      r.folders = folder;
      if (folder.length) {
        const dir = path.join(dataDir, folder[0]);
        r.folderFiles = folderListing(dir);
        r.csv = {
          videos: readCsv(path.join(dir, "videos.csv")),
          comments: readCsv(path.join(dir, "comments.csv")),
          transcripts: readCsv(path.join(dir, "transcripts.csv")),
          summary: readCsv(path.join(dir, "summary.csv")),
        };
      }
      r.ytchanAfter = ytchanDirs().map((d) => path.basename(d));
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.e2 = r;
  }

  /* ============================== E-5 ============================== */
  {
    makeStub(STUB, {
      auth: { default: SIGNED_IN, app: SIGNED_IN },
      channel: { videos: 6, commentsPerVideo: 1, captionLines: 1, delayMs: 0, name: "Stub Channel" },
    });
    const dataDir = path.join(DATA, "e5");
    fs.mkdirSync(dataDir, { recursive: true });
    for (const d of ytchanDirs()) fs.rmSync(d, { recursive: true, force: true });
    const a = await launch({
      mirror: MIRROR,
      label: `e5-${RUN}`,
      cwd: STUB,
      cookieFile: cookieTxt(),
      seed: seedFor(dataDir),
    });
    const r = {};
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(3000);
      await openChannelScreen(a);
      await a.win.fill('input[placeholder="https://www.youtube.com/@channelhandle"]', "https://www.youtube.com/@stubchannel");
      await setParts(a.win, { videoDetails: true, comments: true, transcripts: true });
      await a.win.fill('input[type="number"]', "10").catch(() => {});
      await a.win.click('button:has-text("Export channel")', { timeout: 10000 });
      await a.win.waitForFunction(
        () => /Export saved|Partial export saved/.test(document.body.textContent || ""),
        { timeout: 180000 },
      );
      await a.win.waitForTimeout(1000);
      const folders1 = fs.readdirSync(dataDir);
      r.run1 = { folders: folders1, listing: folderListing(path.join(dataDir, folders1[0] || "")) };
      r.run1Panel = await panelState(a.win);
      r.shot1 = await a.shot("e5-run1");

      // Run 2: transcripts only, same channel, nothing else changed.
      await setParts(a.win, { videoDetails: false, comments: false, transcripts: true });
      await a.win.waitForTimeout(1500);
      await a.win.click('button:has-text("Export channel")', { timeout: 10000 });
      await a.win.waitForFunction(
        () => /Export saved|Partial export saved/.test(document.body.textContent || ""),
        { timeout: 180000 },
      );
      await a.win.waitForTimeout(1500);
      const folders2 = fs.readdirSync(dataDir);
      r.run2 = { folders: folders2, listing: folderListing(path.join(dataDir, folders2[0] || "")) };
      r.run2Panel = await panelState(a.win);
      r.shot2 = await a.shot("e5-run2");
      const dir = path.join(dataDir, folders2[0] || "");
      r.finalSummary = readCsv(path.join(dir, "summary.csv"));
      r.finalCsvs = {
        videos: readCsv(path.join(dir, "videos.csv")),
        comments: readCsv(path.join(dir, "comments.csv")),
        transcripts: readCsv(path.join(dir, "transcripts.csv")),
      };
      r.oneFolderForTwoRuns = folders2.length === 1;

      // Ten DIFFERENT channel URLs, same reported channel name: one folder?
      const before = fs.readdirSync(dataDir).length;
      for (let i = 0; i < 3; i++) {
        await a.win.fill(
          'input[placeholder="https://www.youtube.com/@channelhandle"]',
          `https://www.youtube.com/@other${i}`,
        );
        await a.win.click('button:has-text("Export channel")', { timeout: 10000 });
        await a.win.waitForFunction(
          () => /Export saved|Partial export saved/.test(document.body.textContent || ""),
          { timeout: 180000 },
        );
        await a.win.waitForTimeout(800);
      }
      r.foldersAfterThreeDifferentChannels = fs.readdirSync(dataDir);
      r.foldersBefore = before;
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.e5 = r;
  }

  /* ========================== E-3 and E-8 ========================== */
  {
    makeStub(STUB, {
      auth: { default: SIGNED_IN, app: SIGNED_IN },
      channel: { videos: 4, commentsPerVideo: 1, captionLines: 1, delayMs: 120, name: "Stub Channel" },
    });
    const dataDir = path.join(DATA, "e38");
    fs.mkdirSync(dataDir, { recursive: true });
    for (const d of ytchanDirs()) fs.rmSync(d, { recursive: true, force: true });
    const a = await launch({
      mirror: MIRROR,
      label: `e38-${RUN}`,
      cwd: STUB,
      cookieFile: cookieTxt(),
      seed: seedFor(dataDir),
    });
    const r3 = {};
    const r8 = {};
    try {
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(3000);

      /* ---- E-3: two identical exports at once, two jobIds ---- */
      const body = {
        url: "https://www.youtube.com/@stubchannel",
        contentType: "all",
        limit: 10,
        includeVideoDetails: true,
        includeComments: true,
        includeTranscripts: true,
        deliver: "path",
      };
      const both = await a.win.evaluate(async (b) => {
        const call = async (jobId) => {
          const res = await fetch(
            `${window.__API_BASE__}/api/channel/export?jobId=${jobId}`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify(b),
            },
          );
          return { jobId, status: res.status, json: await res.json().catch(() => null) };
        };
        return Promise.all([call("s4-race-A"), call("s4-race-B")]);
      }, body);
      r3.responses = both.map((x) => ({
        jobId: x.jobId,
        status: x.status,
        cancelled: x.json?.cancelled,
        counts: x.json?.counts,
        exported: x.json?.channel?.exported,
        dir: x.json?.dir,
        files: x.json?.files?.map((f) => `${f.name}:${f.bytes}`),
      }));
      r3.csvs = {};
      for (const x of both) {
        if (!x.json?.dir) continue;
        r3.csvs[x.jobId] = {
          videos: readCsv(path.join(x.json.dir, "videos.csv")),
          comments: readCsv(path.join(x.json.dir, "comments.csv")),
          transcripts: readCsv(path.join(x.json.dir, "transcripts.csv")),
          summary: readCsv(path.join(x.json.dir, "summary.csv")),
        };
      }
      r3.checkpointDirsAfter = ytchanDirs().map((d) => path.basename(d));
      r3.expectedRowsPerFile = 4; // 4 videos x 1 comment / 1 caption line

      /* ---- E-8: cancel between the SSE open and the POST ---- */
      const jobId = "s4-poisoned-1";
      r8.sseOpened = await a.win.evaluate((id) => {
        return new Promise((resolve) => {
          const es = new EventSource(
            `${window.__API_BASE__}/api/channel/export/progress?jobId=${id}`,
          );
          window.__s4es = es;
          es.onopen = () => resolve("open");
          es.onmessage = () => resolve("message");
          setTimeout(() => resolve("timeout"), 4000);
        });
      }, jobId);
      r8.cancel = await api(a.win, "POST", "/api/channel/export/cancel", { jobId }).then((x) => ({
        status: x.status,
        json: x.json,
      }));
      r8.export = await a.win.evaluate(
        async ([id, b]) => {
          const res = await fetch(`${window.__API_BASE__}/api/channel/export?jobId=${id}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(b),
          });
          return { status: res.status, json: await res.json().catch(() => null) };
        },
        [jobId, { ...body, deliver: "rows" }],
      );
      r8.summary = {
        status: r8.export.status,
        cancelled: r8.export.json?.cancelled,
        exported: r8.export.json?.channel?.exported,
        videos: r8.export.json?.videos?.length,
        comments: r8.export.json?.comments?.length,
        transcripts: r8.export.json?.transcripts?.length,
        statuses: r8.export.json?.statuses?.length,
      };
      // What the UI would make of it: a 200 with cancelled:true and 0 rows.
      // Reproduce the hook's own branch by running the same decision.
      r8.uiWouldSay =
        r8.export.status === 200
          ? r8.export.json?.cancelled
            ? "Partial export saved"
            : "Export saved"
          : "error banner";
      // And a control: a fresh jobId right after, to show it is per-job.
      r8.control = await a.win.evaluate(
        async (b) => {
          const res = await fetch(`${window.__API_BASE__}/api/channel/export?jobId=s4-clean-1`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(b),
          });
          const j = await res.json().catch(() => null);
          return { status: res.status, cancelled: j?.cancelled, exported: j?.channel?.exported };
        },
        { ...body, deliver: "rows" },
      );
      await a.win.evaluate(() => window.__s4es?.close());

      /* ---- E-3, reachability: two workspace tabs, two real panels ----
       * ChannelExportProvider is mounted per tab (App.tsx ChannelBoundary
       * inside the tab map), so two tabs give two independent exporters and
       * the "button disables while exporting" guard does not apply across
       * them. This is the no-devtools route to E-3. */
      for (const d of ytchanDirs()) fs.rmSync(d, { recursive: true, force: true });
      await a.win.click('button[aria-label="New tab"]', { timeout: 10000 });
      await a.win.waitForTimeout(1500);
      const startInVisibleTab = async () => {
        await a.win.click("#ui-channel-link", { timeout: 10000 });
        await a.win.waitForTimeout(600);
        await a.win.fill(
          'input[placeholder="https://www.youtube.com/@channelhandle"]:visible',
          "https://www.youtube.com/@stubchannel",
        );
        await a.win.waitForTimeout(300);
        await a.win.click('button:has-text("Export channel"):visible', { timeout: 10000 });
      };
      await startInVisibleTab();
      // Switch back to tab 1 (the tab strip's first [role=tab]) and start the
      // same export there too.
      r3.tabCount = await a.win.locator('[role="tab"]').count();
      await a.win.locator('[role="tab"]').first().click();
      await a.win.waitForTimeout(900);
      r3.twoTabSecondStart = await startInVisibleTab()
        .then(() => "started")
        .catch((e) => `could not start: ${String(e).split("\n")[0].slice(0, 70)}`);
      await a.win.waitForTimeout(25000);
      r3.twoTabPanels = await a.win.evaluate(() => {
        const panes = Array.from(document.querySelectorAll("div.absolute.inset-0"));
        return panes.map((p) => {
          const t = (p.textContent || "").replace(/\s+/g, " ");
          return {
            result: /Partial export saved/.test(t)
              ? "Partial export saved"
              : /Export saved/.test(t)
                ? "Export saved"
                : null,
            detail: Array.from(p.querySelectorAll("span"))
              .map((e) => (e.textContent || "").trim())
              .find((x) => /\d+ videos/.test(x)) ?? null,
          };
        });
      });
      r3.twoTabFolder = folderListing(
        path.join(dataDir, fs.existsSync(dataDir) ? fs.readdirSync(dataDir)[0] ?? "" : ""),
      );
      r3.twoTabShot = await a.shot("e3-two-tabs");
    } catch (e) {
      r3.error = String(e);
      r8.error = String(e);
    }
    await a.close();
    report.e3 = r3;
    report.e8 = r8;
  }

  const outFile = path.join(__dirname, "out", `e2-e3-e5-e8-run${RUN}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2).slice(0, 16000));
  console.log("\nwrote", outFile);
})().catch((e) => { console.error(e); process.exit(1); });
