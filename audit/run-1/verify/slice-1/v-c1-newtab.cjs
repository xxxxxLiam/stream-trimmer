/**
 * v-c1-newtab.cjs — C-1. Does "two video tabs + a non-empty clip bank" blank
 * the whole app with React error #185 (infinite render loop)?
 *
 * Written from the finding's Steps. Arms, each its own cold start:
 *   seeded   — one campaign, bank seeded with one BANKED row for the loaded
 *              video, then click + (the finding's route)
 *   empty    — identical, but the bank is empty (control: is the bank the cause?)
 *   cutstatus— identical, but the single bank row has status "cut", so
 *              bankedRanges() yields nothing (control: is it the ROWS or the
 *              PLANNED RANGES that matter?)
 *   import   — bank empty at boot, a row imported through the real import box,
 *              then click + (the finding's second route)
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-c1-newtab.cjs <arm>
 */
const { boot, loadUrl, alive } = require("./v-lib.cjs");

const arm = process.argv[2] || "seeded";
const VID = "stub0000001";

const campaign = {
  id: "acme-q4",
  name: "Acme Q4",
  targetMinSec: 30,
  targetMaxSec: 60,
  hardMaxSec: 90,
  clipIdPattern: "{prefix}-{videoId}-{nn}",
  prefix: "AQ",
  format: "mp4",
  quality: "best",
  clipsDir: "/tmp/v-c1-clips",
  dataDir: "/tmp/v-c1-data",
  usedRanges: {},
};

const row = (status) => ({
  id: "A01",
  label: "acme hook",
  segments: [{ start: 60, end: 90 }],
  status,
  category: "hook",
  tier: "T1",
});

const seed = {
  "clipper.dataDirConfirmed": true,
  "clipper.campaigns": [campaign],
  "clipper.activeCampaign": "acme-q4",
  "clipper.clipsDir": "/tmp/v-c1-clips",
  "clipper.dataDir": "/tmp/v-c1-data",
};
if (arm === "seeded") seed["clipper.bank"] = { "acme-q4": { [VID]: [row("banked")] } };
if (arm === "cutstatus") seed["clipper.bank"] = { "acme-q4": { [VID]: [row("cut")] } };

(async () => {
  const a = await boot({
    label: `v-c1-${arm}`,
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 900 },
    seed,
  });
  try {
    await loadUrl(a, `https://www.youtube.com/watch?v=${VID}`);
    await a.win.waitForTimeout(1500);

    // Open the Bank sub-tab so the rows are actually on screen.
    const bankTab = a.win.locator('[id^="clips-tab-"]:visible', { hasText: "Bank" }).first();
    if (await bankTab.count()) await bankTab.click().catch(() => {});
    await a.win.waitForTimeout(800);

    if (arm === "import") {
      await a.win.locator("button:visible", { hasText: "Import timestamps" }).first().click();
      await a.win.locator("textarea:visible").first().fill("A01 1:00-1:30 hook");
      await a.win.waitForTimeout(600);
      const confirm = a.win.locator("button:visible", { hasText: /^Import \d+ clip/ }).first();
      a.log("import button:", await confirm.innerText().catch(() => "none"));
      await confirm.click();
      await a.win.waitForTimeout(1200);
    }

    const bankRows = await a.win.evaluate(() =>
      [...document.querySelectorAll('#clips-panel [role="button"]')]
        .filter((e) => e.offsetParent)
        .map((e) => e.innerText.replace(/\s+/g, " ").trim().slice(0, 60)),
    );
    a.log("bank rows on screen:", bankRows);
    a.log("campaign chip:", await a.win.evaluate(() => {
      const c = document.querySelector("#ui-campaign-chip");
      return c ? c.innerText.replace(/\s+/g, " ").trim() : null;
    }));
    a.log("alive before +:", await a.win.evaluate(alive));
    await a.shot("before-new-tab");

    await a.win.click('[aria-label="New tab"]');
    await a.win.waitForTimeout(2500);
    const after = await a.win.evaluate(alive).catch((e) => `EVAL FAILED: ${e.message}`);
    a.log("alive right after +:", after);
    a.log("#clips-tab-bank count:", await a.win.evaluate(() =>
      document.querySelectorAll('[id^="clips-tab-"]').length).catch(() => "n/a"));
    await a.shot("after-new-tab");

    await a.win.waitForTimeout(8000);
    a.log("alive 10s later:", await a.win.evaluate(alive).catch((e) => `EVAL FAILED: ${e.message}`));
    await a.shot("10s-later");

    a.log("page errors:", a.logs.pageErrors.slice(0, 5));
    a.log("console errors:", a.logs.console.filter((l) => /error/i.test(l)).slice(0, 5));

    // Does the data on disk survive, and does a relaunch-equivalent reload recover?
    await a.win.reload();
    await a.win.waitForTimeout(4000);
    a.log("after reload, alive:", await a.win.evaluate(alive).catch((e) => String(e)));
    const st = a.readState();
    a.log("bank on disk after the crash:", JSON.stringify(st["clipper.bank"]));
    a.log("workspaces on disk:", JSON.stringify(st["clipper.workspaces"]));
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
