/**
 * File: 17-facets.cjs
 * Path: audit/run-1/area-C/17-facets.cjs
 * Description: Area C: the bank's filter chips are collected campaign-wide while the list
 *   is per video. Audit-only.
 */
const { boot, campaign, clip, loadVideo, openBankTab, VID } = require("./lib.cjs");
const log = (...x) => console.log("[C17]", ...x);
const VID2 = "stub0000002";

(async () => {
  const a = await boot("C17-facets", {
    "clipper.campaigns": [campaign("acme-q4", "Acme Q4")],
    "clipper.activeCampaign": "acme-q4",
    "clipper.bank": {
      "acme-q4": {
        [VID]: [clip("A01", 60, 90, { category: "hook", tier: "1" })],
        [VID2]: [clip("B01", 60, 90, { category: "promo-for-the-other-video", tier: "9" })],
      },
    },
  });
  try {
    await loadVideo(a);
    await openBankTab(a);
    await a.win.waitForTimeout(500);
    const chips = await a.win.locator('[aria-label="Filters"] button').allInnerTexts();
    log("video 1 is loaded; its bank holds 1 clip categorised 'hook'");
    log("filter chips offered:", JSON.stringify(chips));
    const other = chips.findIndex((c) => /promo-for-the-other-video/.test(c));
    log("a chip for a category that belongs to another video is offered:", other >= 0);
    if (other >= 0) {
      await a.win.locator('[aria-label="Filters"] button').nth(other).click();
      await a.win.waitForTimeout(300);
      const t = await a.win.locator("#ui-col-clips").innerText();
      log("after clicking it:", JSON.stringify(t.split("\n").filter((l) => /clips|match/.test(l))));
      log("shot:", await a.shot("dead-filter-chip"));
    }
  } catch (e) {
    console.error("FAIL", e);
  } finally {
    await a.close();
  }
})();
