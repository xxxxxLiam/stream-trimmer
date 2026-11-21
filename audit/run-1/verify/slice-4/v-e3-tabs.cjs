#!/usr/bin/env node
/**
 * E-3, reachability without devtools: ChannelExportProvider is mounted per
 * workspace tab (App.tsx ChannelBoundary inside the tab map), so two tabs give
 * two independent exporters and the panel's "button disables while exporting"
 * guard does not apply across them. If two real panels can both be running,
 * E-3's corruption is reachable from the shipped UI.
 *
 * (Everything here is scoped with :visible / .last(), because with two tabs
 * open every id exists twice — which is F-2.)
 *
 * usage: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-e3-tabs.cjs [run]
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, cookieTxt, SIGNED_IN_STDERR } = require("./lib.cjs");
const { makeStub } = require("./mkstub.cjs");

const RUN = process.argv[2] || "1";
const STUB = `/tmp/s4-stub-e3tabs-${RUN}`;
const DATA = `/tmp/s4-e3tabs-data-${RUN}`;
const URLSEL = 'input[placeholder="https://www.youtube.com/@channelhandle"]';

const ytchanDirs = () =>
  fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("ytchan-"));

function readCsv(file) {
  if (!fs.existsSync(file)) return { missing: true };
  const lines = fs
    .readFileSync(file, "utf8")
    .replace(/^﻿/, "")
    .split(/\r?\n/)
    .filter(Boolean);
  return { dataRows: Math.max(0, lines.length - 1), firstRows: lines.slice(1, 5) };
}

(async () => {
  fs.rmSync(DATA, { recursive: true, force: true });
  fs.mkdirSync(DATA, { recursive: true });
  for (const d of ytchanDirs()) fs.rmSync(path.join(os.tmpdir(), d), { recursive: true, force: true });

  makeStub(STUB, {
    auth: { default: { exitCode: 0, stdout: SIGNED_IN_STDERR }, app: { exitCode: 0, stdout: SIGNED_IN_STDERR } },
    channel: { videos: 4, commentsPerVideo: 1, captionLines: 1, delayMs: 350, name: "Stub Channel" },
  });

  const a = await launch({
    mirror: "/tmp/s4-owner-star",
    label: `e3tabs-${RUN}`,
    cwd: STUB,
    cookieFile: cookieTxt(),
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.authSource": "app",
      "clipper.dataDir": DATA,
      "clipper.campaigns": [{ id: "camp1", name: "Campaign One", clipsDir: `${DATA}/clips`, dataDir: DATA }],
      "clipper.activeCampaign": "camp1",
    },
  });
  const r = { run: RUN };
  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    await a.win.waitForTimeout(3000);

    const startHere = async (who) => {
      await a.win.locator("#ui-channel-link:visible").click({ timeout: 10000 });
      await a.win.waitForTimeout(700);
      await a.win.locator(`${URLSEL}:visible`).fill("https://www.youtube.com/@stubchannel");
      await a.win.waitForTimeout(300);
      await a.win.locator('button:has-text("Export channel"):visible').click({ timeout: 10000 });
      r[`${who}Started`] = true;
    };

    // Tab 1
    await startHere("tab1");
    // Tab 2
    await a.win.click('button[aria-label="New tab"]', { timeout: 10000 });
    await a.win.waitForTimeout(1200);
    r.tabCount = await a.win.locator('[role="tab"]').count();
    await startHere("tab2");
    // Both running at once?
    r.bothExporting = await a.win.evaluate(() => {
      const panes = Array.from(document.querySelectorAll("div.absolute.inset-0"));
      return panes.map((p) => /Stop/.test(p.textContent || ""));
    });
    r.shotRunning = await a.shot("both-running");

    // Wait for both to settle.
    for (let i = 0; i < 90; i++) {
      await a.win.waitForTimeout(1000);
      const done = await a.win.evaluate(() => {
        const panes = Array.from(document.querySelectorAll("div.absolute.inset-0"));
        return panes.every((p) => !/Stop/.test(p.textContent || ""));
      });
      if (done) break;
    }
    await a.win.waitForTimeout(1500);

    r.panels = await a.win.evaluate(() => {
      const panes = Array.from(document.querySelectorAll("div.absolute.inset-0"));
      return panes.map((p) => {
        const t = (p.textContent || "").replace(/\s+/g, " ");
        return {
          result: /Partial export saved/.test(t)
            ? "Partial export saved"
            : /Export saved/.test(t)
              ? "Export saved"
              : null,
          detail:
            Array.from(p.querySelectorAll("span"))
              .map((e) => (e.textContent || "").trim())
              .find((x) => /\d+ videos/.test(x)) ?? null,
          error: p.querySelector('[role="alert"]')?.textContent?.trim() ?? null,
        };
      });
    });
    r.shotDone = await a.shot("both-done");

    const folders = fs.readdirSync(DATA).filter((f) => fs.statSync(path.join(DATA, f)).isDirectory());
    r.folders = folders;
    if (folders.length) {
      const dir = path.join(DATA, folders[0]);
      r.files = fs.readdirSync(dir);
      r.csv = {
        videos: readCsv(path.join(dir, "videos.csv")),
        comments: readCsv(path.join(dir, "comments.csv")),
        transcripts: readCsv(path.join(dir, "transcripts.csv")),
      };
    }
    r.expectedRowsPerFile = 8; // 4 videos on /videos + 4 on /shorts, 1 each
  } catch (e) {
    r.error = String(e).split("\n")[0];
  }
  await a.close();

  const outFile = path.join(__dirname, "out", `e3-tabs-run${RUN}.json`);
  fs.writeFileSync(outFile, JSON.stringify(r, null, 2));
  console.log(JSON.stringify(r, null, 2));
  console.log("\nwrote", outFile);
})().catch((e) => { console.error(e); process.exit(1); });
