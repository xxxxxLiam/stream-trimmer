/**
 * File: 13-newtab-probe.cjs
 * Path: audit/run-1/area-C/13-newtab-probe.cjs
 * Description: Area C diagnostic: what the window looks like right after New tab is clicked.
 *   Audit-only.
 */
const { boot, campaign, loadVideo, openBankTab, importBlock } = require("./lib.cjs");
const log = (...x) => console.log("[C13]", ...x);

(async () => {
  const a = await boot("C13-newtab", {
    "clipper.campaigns": [campaign("acme-q4", "Acme Q4")],
    "clipper.activeCampaign": "acme-q4",
  });
  try {
    await loadVideo(a);
    await openBankTab(a);
    log("import:", await importBlock(a, "A01 1:00-1:30 first video hook"));
    log("before: tabs", await a.win.locator('[role="tab"]').count(), "| body len", (await a.win.locator("body").innerText()).length);
    await a.win.click('button[aria-label="New tab"]');
    for (const ms of [300, 1000, 3000, 8000]) {
      await a.win.waitForTimeout(ms);
      const snap = await a.win.evaluate(() => ({
        bodyText: document.body.innerText.slice(0, 300),
        html: document.documentElement.outerHTML.length,
        tabs: document.querySelectorAll('[role="tab"]').length,
        urlInputs: document.querySelectorAll('input[type="url"]').length,
        header: !!document.querySelector("header"),
        root: document.querySelector("#root")?.children.length,
      }));
      log(`+${ms}ms`, JSON.stringify(snap));
    }
    log("shot:", await a.shot("after-new-tab"));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 1200));
    log("console tail:", JSON.stringify(a.logs.console.slice(-5)).slice(0, 1200));
  } catch (e) {
    console.error("FAIL", e);
  } finally {
    await a.close();
  }
})();
