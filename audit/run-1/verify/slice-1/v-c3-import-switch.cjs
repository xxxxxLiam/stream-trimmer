/**
 * v-c3-import-switch.cjs — C-3. Does switching campaign with the import box
 * open throw the whole paste away?
 *
 * Written from the finding's Steps. Two campaigns seeded, a video loaded, the
 * Bank tab open. A 40-line block is pasted into the importer; without
 * confirming, the campaign chip is opened and the OTHER campaign picked; then
 * the first campaign is picked again. Records whether the textarea is still
 * there, what it holds, and whether any warning was shown.
 *
 * Control arm `same`: open the chip and re-pick the SAME campaign — if the
 * paste also vanishes then it is the popover, not the switch.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-c3-import-switch.cjs [same]
 */
const { boot, loadUrl } = require("./v-lib.cjs");

const arm = process.argv[2] === "same" ? "same" : "switch";
const VID = "stub0000001";

const mk = (id, name) => ({
  id,
  name,
  targetMinSec: 30,
  targetMaxSec: 60,
  hardMaxSec: 90,
  clipIdPattern: "{prefix}-{videoId}-{nn}",
  prefix: name.slice(0, 2).toUpperCase(),
  format: "mp4",
  quality: "best",
  clipsDir: `/tmp/v-c3-${id}-clips`,
  dataDir: `/tmp/v-c3-${id}-data`,
  usedRanges: {},
});

const paste = Array.from(
  { length: 40 },
  (_, i) => `P${String(i + 1).padStart(2, "0")} ${1 + i}:00-${1 + i}:30 line ${i + 1}`,
).join("\n");

const importerState = () => {
  const vis = (el) => el && el.offsetParent !== null;
  const ta = [...document.querySelectorAll("textarea")].find(vis) || null;
  return {
    textareaOpen: Boolean(ta),
    textLength: ta ? ta.value.length : 0,
    firstLine: ta ? ta.value.split("\n")[0] : null,
    importButtons: [...document.querySelectorAll("button")]
      .filter(vis)
      .map((b) => b.innerText.replace(/\s+/g, " ").trim())
      .filter((s) => /import|cancel|nothing to import/i.test(s)),
    campaignChip: (() => {
      const c = document.querySelector("#ui-campaign-chip");
      return c ? c.innerText.replace(/\s+/g, " ").trim() : null;
    })(),
    anyWarning: [...document.querySelectorAll('[role="alert"], [role="status"]')]
      .filter(vis)
      .map((e) => e.innerText.replace(/\s+/g, " ").trim())
      .filter(Boolean),
    bankRows: [...document.querySelectorAll('#clips-panel [role="button"]')].filter(vis).length,
  };
};

(async () => {
  const a = await boot({
    label: `v-c3-${arm}`,
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1250 },
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.campaigns": [mk("acme", "Acme Q4"), mk("beta", "Beta Launch")],
      "clipper.activeCampaign": "acme",
    },
  });
  const dialogs = [];
  a.win.on("dialog", async (d) => {
    dialogs.push({ type: d.type(), message: d.message() });
    await d.dismiss().catch(() => {});
  });
  try {
    await loadUrl(a, `https://www.youtube.com/watch?v=${VID}`);
    await a.win.waitForTimeout(1500);
    const bankTab = a.win.locator('[id^="clips-tab-"]:visible', { hasText: "Bank" }).first();
    await bankTab.click();
    await a.win.waitForTimeout(600);

    await a.win.locator("button:visible", { hasText: "Import timestamps" }).first().click();
    await a.win.locator("textarea:visible").first().fill(paste);
    await a.win.waitForTimeout(1500);
    a.log("paste in the box:", await a.win.evaluate(importerState));
    await a.shot("mid-import");

    // Open the campaign chip and pick a campaign.
    await a.win.click("#ui-campaign-chip");
    await a.win.waitForTimeout(600);
    const target = arm === "same" ? "Acme Q4" : "Beta Launch";
    await a.win.locator('[role="option"]', { hasText: target }).first().click();
    await a.win.waitForTimeout(1500);
    a.log(`after picking [${target}]:`, await a.win.evaluate(importerState));
    await a.shot("after-pick");

    if (arm === "switch") {
      await a.win.click("#ui-campaign-chip");
      await a.win.waitForTimeout(600);
      await a.win.locator('[role="option"]', { hasText: "Acme Q4" }).first().click();
      await a.win.waitForTimeout(1500);
      a.log("back on Acme Q4:", await a.win.evaluate(importerState));
      await a.shot("back-on-acme");
    }

    a.log("any confirm/alert dialog at any point:", dialogs);
    a.log("any 'unsaved'/'discard' wording on screen:", await a.win.evaluate(() =>
      /unsaved|discard|lose your paste|keep your paste/i.test(document.body.innerText)));
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
