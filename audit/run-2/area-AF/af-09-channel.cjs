#!/usr/bin/env node
/**
 * AF-09 — owner build: the ChannelExportPanel error path (T10 item 8), the
 * two channel help anchors in their real states, and whether a tutorial that
 * tells the user to change screen survives being followed.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, jar, AUTH_TEXT } = require("./lib.cjs");
const { corpus, leaks, MARKERS } = require("./markers.cjs");

const R = { markerCount: MARKERS.length };
const DATA = "/tmp/af-data-09";
const CLIPS = "/tmp/af-clips-09";

const CAMPAIGN = {
  id: "camp_af9", name: "Audit AF", targetMinSec: 1, targetMaxSec: 600, hardMaxSec: 900,
  clipIdPattern: "{prefix}-{videoId}-{nn}", prefix: "AF", format: "mp4", quality: "360",
  clipsDir: CLIPS, dataDir: DATA, usedRanges: {},
};

async function main() {
  for (const d of [DATA, CLIPS]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }

  writeStub({
    auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
    subs: {}, downloadStage: {},
    infoStage: { exitCode: 1, stderr: corpus() },
  });

  const a = await launch({
    label: "af-09-owner",
    mirror: "/tmp/af-owner",
    cookieFile: jar(),
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.campaigns": [CAMPAIGN],
      "clipper.activeCampaign": "camp_af9",
      "clipper.clipsDir": CLIPS,
      "clipper.saveDir": CLIPS,
      "clipper.saveDirs": [CLIPS],
      "clipper.dataDir": DATA,
    },
  });
  try {
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(2500);
    R.channelLinkPresent = (await a.win.locator("#ui-channel-link").count()) > 0;

    // --- the tutorial that tells you to change screen ---------------------
    await a.win.click("#ui-help-button");
    await a.win.waitForSelector("#ui-help-drawer");
    await a.win.fill("#help-search", "Export a channel");
    await a.win.waitForTimeout(300);
    await a.win.locator("#ui-help-drawer [data-help-result]").first().click();
    await a.win.waitForTimeout(400);
    R.tutorialBeforeNav = await a.win.evaluate(() => ({
      heading: document.querySelector("#ui-help-drawer h3")?.textContent || null,
      stepLine: Array.from(document.querySelectorAll("#ui-help-drawer span"))
        .map((s) => s.textContent.trim()).find((t) => /^Step \d+ of \d+$/.test(t)) || null,
      spotlight: document.querySelector("[data-help-spotlight]")?.getAttribute("data-help-spotlight") || null,
    }));
    await a.win.click("#ui-channel-link");
    await a.win.waitForTimeout(900);
    R.tutorialAfterNav = await a.win.evaluate(() => ({
      heading: document.querySelector("#ui-help-drawer h3")?.textContent || null,
      stepLine: Array.from(document.querySelectorAll("#ui-help-drawer span"))
        .map((s) => s.textContent.trim()).find((t) => /^Step \d+ of \d+$/.test(t)) || null,
      spotlight: document.querySelector("[data-help-spotlight]")?.getAttribute("data-help-spotlight") || null,
      listShown: document.querySelectorAll("#ui-help-drawer [data-help-result]").length,
      searchValue: document.getElementById("help-search")?.value ?? null,
    }));
    R.shot_nav = await a.shot("tutorial-after-screen-change");

    // --- the export error alert -------------------------------------------
    await a.win.fill("#ui-help-button + *, #ui-help-drawer input#help-search", "").catch(() => {});
    await a.win.click("#ui-help-button"); // close help so it does not cover the panel
    await a.win.waitForTimeout(300);
    const urlBox = a.win.locator('input[placeholder*="channelhandle"], input[placeholder*="youtube.com/@"]').first();
    await urlBox.fill("https://www.youtube.com/@stubchannel");
    await a.win.waitForTimeout(300);
    await a.win.click("#ui-channel-start");
    await a.win.waitForTimeout(8000);
    const alertText = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[role="alert"]')).map((e) => e.textContent).join("\n"),
    );
    R.exportError = alertText.replace(/\s+/g, " ").slice(0, 400);
    R.exportErrorLeaks = leaks(alertText);
    R.exportBodyLeaks = leaks(await a.win.evaluate(() => document.body.innerText));
    R.shot_error = await a.shot("channel-export-error");

    // --- ui-channel-stop while an export is actually running ---------------
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      subs: {}, downloadStage: {},
      infoStage: { exitCode: 0, delayMs: 20000 },
    });
    await a.win.click("#ui-channel-start");
    await a.win.waitForTimeout(2500);
    R.exportingNow = (await a.win.locator("#ui-channel-stop").count()) > 0;
    await a.win.click("#ui-help-button");
    await a.win.waitForSelector("#ui-help-drawer");
    await a.win.fill("#help-search", "Stop a run");
    await a.win.waitForTimeout(300);
    await a.win.locator("#ui-help-drawer [data-help-result]").first().click();
    await a.win.waitForTimeout(700);
    R.stopRunStep1 = await a.win.evaluate(() => ({
      anchorPresent: !!document.getElementById("ui-channel-stop"),
      spotlight: document.querySelector("[data-help-spotlight]")?.getAttribute("data-help-spotlight") || null,
      notice: Array.from(document.querySelectorAll("#ui-help-drawer [role=status]")).some((p) =>
        /not on screen right now/.test(p.textContent || ""),
      ),
    }));
    R.shot_stop = await a.shot("stop-run-step1-while-exporting");
    await a.win.click("#ui-channel-stop").catch(() => {});
    await a.win.waitForTimeout(1500);
  } finally {
    a.save("af-09.json", R);
    fs.writeFileSync(path.join(__dirname, "out", "af-09.json"), JSON.stringify(R, null, 2));
    await a.close();
  }
  console.log(JSON.stringify(R, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
