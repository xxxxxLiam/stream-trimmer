#!/usr/bin/env node
/**
 * t1-owner-e2e.cjs — the opposite failure mode T7 nearly caused.
 *
 * An OWNER build must still work end to end in the packaged shape: the server
 * half of the gate must find the owner list that scripts/build-server.cjs baked
 * in, the three routes must answer, and the CSVs must reach the data folder.
 *
 * Also covers E-5: two runs of the same channel on the same day must produce
 * two folders, and each folder's summary.csv must describe its own run.
 *
 * usage: xvfb-run -a --server-args="-screen 0 1440x900x24" node t1-owner-e2e.cjs <shape>
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");

const SHAPE = process.argv[2] || "owner-hash";

function listFolder(dir) {
  try {
    return fs.readdirSync(dir).sort();
  } catch {
    return null;
  }
}
function readCsv(file) {
  try {
    const raw = fs.readFileSync(file, "utf8");
    const lines = raw.replace(/^﻿/, "").split("\r\n").filter((l) => l.length);
    return { bytes: raw.length, header: lines[0], rows: lines.length - 1, first: lines[1] ?? null, bom: raw.startsWith("﻿"), crlf: raw.includes("\r\n") };
  } catch (e) {
    return { error: String(e) };
  }
}

async function signIn(a) {
  // Launch-time probe path only (local): drop a synthetic Netscape jar at the
  // canonical path and reload, so the undismissable sign-in modal is satisfied
  // without touching the network. The brief's "Continue without signing in"
  // button is used as a fallback if the modal is still up.
  const exp = Math.floor(Date.now() / 1000) + 2592000;
  const row = (n, v) => [".youtube.com", "TRUE", "/", "TRUE", String(exp), n, v].join("\t");
  fs.writeFileSync(
    path.join(a.userDataDir, "yt-cookies.txt"),
    ["# Netscape HTTP Cookie File", row("SID", "r2e-sid"), row("__Secure-3PSID", "r2e-3p"), row("__Secure-1PSID", "r2e-1p"), ""].join("\n"),
  );
  await a.win.reload();
  await a.win.waitForSelector("header", { timeout: 30000 });
  await a.win
    .waitForSelector('[aria-labelledby="youtube-connect-title"]', { state: "detached", timeout: 8000 })
    .catch(async () => {
      const btn = a.win.locator('button:has-text("Continue without signing in")');
      if (await btn.count()) await btn.first().click().catch(() => {});
    });
}

async function runExport(a, opts = {}) {
  await a.win.fill('input[placeholder="https://www.youtube.com/@channelhandle"]', opts.url ?? "https://www.youtube.com/@stubchannel");
  if (opts.limit !== undefined) {
    await a.win.fill('input[type="number"]', String(opts.limit));
  }
  if (opts.untick) {
    for (const label of opts.untick) {
      const box = a.win.locator(`label:has-text("${label}") input[type="checkbox"]`).first();
      if (await box.isChecked()) await box.uncheck();
    }
  }
  await a.win.click("#ui-channel-start");
  // Wait for the result card or an error alert.
  const deadline = Date.now() + 120000;
  let state = null;
  while (Date.now() < deadline) {
    state = await a.win.evaluate(() => {
      const card = [...document.querySelectorAll("div")].find(
        (d) => /^(Export saved|Partial export saved)/.test(d.textContent || "") && d.querySelector("svg"),
      );
      const alert = document.querySelector('[role="alert"]');
      const running = Boolean(document.getElementById("ui-channel-stop"));
      const text = document.body.innerText;
      return {
        running,
        resultText: /Export saved|Partial export saved/.test(text)
          ? text.split("\n").filter((l) => /Export saved|Partial export saved|videos|transcript lines|comments/.test(l)).slice(0, 6)
          : null,
        alert: alert ? alert.textContent : null,
        phase: (text.match(/(Reading the channel list|Video details \d+ of \d+|Comments and transcripts, video \d+ of \d+)/) || [])[0] || null,
        hasCard: Boolean(card),
      };
    });
    if (!state.running && (state.resultText || state.alert)) break;
    await sleep(300);
  }
  return state;
}

(async () => {
  const report = { shape: SHAPE, startedAt: new Date().toISOString() };
  const root = stubRoot("t1");
  setStub(root, { videos: 6, commentTexts: ["hello", "second comment"], channelName: "Stub Channel" });
  const dataDir = fs.mkdtempSync("/tmp/r2e-data-t1-");
  const clipsDir = fs.mkdtempSync("/tmp/r2e-clips-t1-");

  const a = await launch({
    shape: SHAPE,
    label: `t1-${SHAPE}`,
    cwd: root,
    seed: {
      "clipper.dataDir": dataDir,
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": clipsDir,
      "clipper.saveDir": clipsDir,
    },
  });
  try {
    await signIn(a);
    report.apiBase = await a.apiBase();

    // 1. Is the feature visible at all?
    report.ui = await a.win.evaluate(() => ({
      navHasChannelLink: Boolean(document.getElementById("ui-channel-link")),
      bodyMentionsChannelData: document.body.innerText.includes("Channel data"),
    }));
    await a.shot("01-workspace");

    if (!report.ui.navHasChannelLink) {
      report.verdict = "no channel link — owner gate hid the feature in this shape";
      save(`t1-${SHAPE}.json`, report);
      await a.shot("02-no-link");
      return;
    }

    // 2. Open the exporter and run it for real.
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector("#ui-channel-start", { timeout: 15000 });
    await a.shot("02-panel-open");
    report.panel = await a.win.evaluate(() => ({
      startDisabled: document.getElementById("ui-channel-start").disabled,
      dataFolderLine: (document.body.innerText.match(/Data folder.*\n.*/) || [])[0] || null,
    }));

    report.run1 = await runExport(a, { limit: 10 });
    await a.shot("03-run1-done");
    report.run1.folders = listFolder(dataDir);
    const f1 = report.run1.folders && report.run1.folders[0];
    if (f1) {
      const dir = path.join(dataDir, f1);
      report.run1.files = listFolder(dir);
      report.run1.csv = {};
      for (const n of report.run1.files || []) report.run1.csv[n] = readCsv(path.join(dir, n));
    }

    // 3. E-5: a SECOND run of the same channel on the same day, different parts.
    await a.win.click('button[aria-label="Dismiss"]').catch(() => {});
    report.run2 = await runExport(a, { limit: 10, untick: ["Video details", "Comments"] });
    await a.shot("04-run2-done");
    report.run2.folders = listFolder(dataDir);
    report.e5 = {
      foldersAfterTwoRuns: report.run2.folders,
      distinct: report.run2.folders ? new Set(report.run2.folders).size : 0,
      perFolder: {},
    };
    for (const f of report.run2.folders || []) {
      const dir = path.join(dataDir, f);
      report.e5.perFolder[f] = {
        files: listFolder(dir),
        summary: readCsv(path.join(dir, "summary.csv")),
      };
    }

    // 4. The three routes answer on an owner machine.
    report.routes = {
      exportBadBody: await a.api("POST", "/api/channel/export", {}),
      cancelNoJob: await a.api("POST", "/api/channel/export/cancel", {}),
      progressNoJob: await a.api("GET", "/api/channel/export/progress"),
      unknownRoute: await a.api("GET", "/api/channel/does-not-exist"),
    };

    // 5. Was the owner verdict in the main process set by the UI's own check?
    report.mainVerdict = await a.win.evaluate(async () => {
      try {
        return { askedWithEmpty: await window.electronAPI.isOwnerMachine([], "") };
      } catch (e) {
        return { error: String(e) };
      }
    });

    report.serverLog = a.logs.stdout.join("").split("\n").filter((l) => /channel|owner|export/i.test(l)).slice(-12);
  } catch (e) {
    report.fatal = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t1-${SHAPE}.json`, report);
    await a.close();
  }
})();
