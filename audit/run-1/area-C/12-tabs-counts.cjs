/**
 * File: 12-tabs-counts.cjs
 * Path: audit/run-1/area-C/12-tabs-counts.cjs
 * Description: Area C: two video tabs importing one after another and interleaved, the bank
 *   rebinding per video, and the counts shown on the bank tab vs the setup checklist.
 *   Audit-only.
 */
const { boot, campaign, loadVideo, openBankTab, importBlock, VID } = require("./lib.cjs");

const log = (...x) => console.log("[C12]", ...x);
const VID2 = "stub0000002";
const colText = (a) => a.win.locator("#ui-col-clips").innerText();

async function checklistBankItem(a) {
  await a.win.click("#ui-help-button");
  await a.win.waitForTimeout(800);
  const open = await a.win.locator("#ui-help-drawer").count();
  let out = "(drawer not found)";
  if (open) {
    const txt = await a.win.locator("#ui-help-drawer").innerText();
    const i = txt.indexOf("clip bank");
    out = i < 0 ? `(no bank item; drawer starts: ${txt.slice(0, 120).replace(/\n/g, " | ")})` : txt.slice(Math.max(0, i - 40), i + 200).replace(/\n/g, " | ");
  }
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(400);
  return out;
}

(async () => {
  const a = await boot("C12-tabs", {
    "clipper.campaigns": [campaign("acme-q4", "Acme Q4"), campaign("beta-launch", "Beta Launch")],
    "clipper.activeCampaign": "acme-q4",
  });
  try {
    await loadVideo(a);
    await openBankTab(a);
    log("tab 1 import:", await importBlock(a, "A01 1:00-1:30 first video hook"));

    // second video tab
    await a.win.click('button[aria-label="New tab"]');
    await a.win.waitForTimeout(600);
    await loadVideo(a, `https://www.youtube.com/watch?v=${VID2}`);
    await openBankTab(a);
    await a.win.waitForTimeout(400);
    log("tab 2 (new video) bank view:", JSON.stringify((await colText(a)).split("\n").slice(0, 8)));
    log("tab 2 import:", await importBlock(a, "A01 2:00-2:30 second video hook"));
    log("bank on disk:", JSON.stringify(a.readState()["clipper.bank"]));
    log("shot:", await a.shot("tab2-bank"));

    // back to tab 1: must show only video 1's rows
    await a.win.locator('[role="tab"]').first().click();
    await a.win.waitForTimeout(700);
    await openBankTab(a);
    await a.win.waitForTimeout(400);
    const t1 = await colText(a);
    log("back on tab 1:", JSON.stringify(t1.split("\n").slice(0, 10)));
    log("tab 1 shows only its own rows:", t1.includes("first video hook") && !t1.includes("second video hook"));
    log("shot:", await a.shot("tab1-bank"));

    // the bank count line vs rows actually listed
    const counted = await a.win.evaluate(() => {
      const col = document.querySelector("#ui-col-clips");
      const line = [...col.querySelectorAll("span")].map((s) => s.textContent).find((x) => / clips?$|of \d+ clips/.test(x || ""));
      return { line, rows: col.querySelectorAll("ul li").length };
    });
    log("count line vs rows on screen:", JSON.stringify(counted));

    // switch campaign: both tabs' banks must disappear
    await a.win.click("#ui-campaign-chip");
    await a.win.locator('[role="option"]:has-text("Beta Launch")').first().click();
    await a.win.waitForTimeout(600);
    await openBankTab(a);
    const t2 = await colText(a);
    log("after switching campaign on tab 1:", JSON.stringify(t2.split("\n").slice(0, 8)));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 400));
  } catch (e) {
    console.error("FAIL", e);
    try { log("shot fail:", await a.shot("fail")); } catch {}
  } finally {
    await a.close();
  }
})();
