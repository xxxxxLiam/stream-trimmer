/**
 * File: 00-smoke.cjs
 * Path: audit/run-1/area-C/00-smoke.cjs
 * Description: Area C smoke: boot with one campaign, load the stub video, open the Bank tab,
 *   import one line, and confirm it persisted. Audit-only.
 */
const { boot, campaign, loadVideo, openBankTab, importBlock, bankOf } = require("./lib.cjs");

(async () => {
  const a = await boot("C00-smoke", {
    "clipper.campaigns": [campaign("acme", "Acme Q4")],
    "clipper.activeCampaign": "acme",
  });
  try {
    console.log("shot header:", await a.shot("booted"));
    await loadVideo(a);
    console.log("shot loaded:", await a.shot("video-loaded"));
    await openBankTab(a);
    const summary = await importBlock(a, "A01 1:00-1:30 the hook line");
    console.log("summary:", summary);
    console.log("shot bank:", await a.shot("bank-after-import"));
    console.log("persisted:", JSON.stringify(bankOf(a, "acme"), null, 1));
    console.log("page text:\n" + (await a.win.locator("#ui-col-clips").innerText()));
  } catch (e) {
    console.error("FAIL", e);
    console.log("shot fail:", await a.shot("fail"));
    console.log("logs:", JSON.stringify(a.logs).slice(0, 3000));
  } finally {
    await a.close();
  }
})();
