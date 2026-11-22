/**
 * File: 14-newtab-crash.cjs
 * Path: audit/run-1/area-C/14-newtab-crash.cjs
 * Description: Area C: isolate the blank-screen crash on New tab. Case A: a campaign and a
 *   video but an EMPTY bank. Case B: the same with bank rows seeded (never imported this
 *   session). Case C: bank rows but the Bank tab never opened. Audit-only.
 */
const { boot, campaign, clip, loadVideo, openBankTab, VID } = require("./lib.cjs");

const CASE = process.argv[2] || "B";
const log = (...x) => console.log(`[C14:${CASE}]`, ...x);

(async () => {
  const seedBank = CASE === "A" ? {} : { "acme-q4": { [VID]: [clip("A01", 60, 90), clip("A02", 120, 150)] } };
  const a = await boot(`C14-newtab-${CASE}`, {
    "clipper.campaigns": [campaign("acme-q4", "Acme Q4")],
    "clipper.activeCampaign": "acme-q4",
    "clipper.bank": seedBank,
  });
  try {
    await loadVideo(a);
    if (CASE !== "C") {
      await openBankTab(a);
      await a.win.waitForTimeout(600);
      log("bank view:", JSON.stringify((await a.win.locator("#ui-col-clips").innerText()).split("\n").slice(0, 6)));
    } else {
      await a.win.click("#clips-tab-video");
      await a.win.waitForTimeout(400);
      log("on 'This video' tab instead of Bank");
    }
    log("before New tab: shot", await a.shot("before-new-tab"));
    await a.win.click('button[aria-label="New tab"]');
    await a.win.waitForTimeout(3000);
    const snap = await a.win.evaluate(() => ({
      rootChildren: document.querySelector("#root")?.children.length ?? -1,
      header: !!document.querySelector("header"),
      text: document.body.innerText.slice(0, 120),
    }));
    log("after New tab:", JSON.stringify(snap));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 300));
    log("shot:", await a.shot("after-new-tab"));

    await a.win.waitForTimeout(3000);
    log("6s later root children:", await a.win.evaluate(() => document.querySelector("#root")?.children.length ?? -1));
    log("bank on disk after the crash:", JSON.stringify(a.readState()["clipper.bank"]));
    await a.close();
  } catch (e) {
    console.error("FAIL", e);
    try { await a.close(); } catch {}
  }
})();
