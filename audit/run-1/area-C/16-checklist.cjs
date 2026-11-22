/**
 * File: 16-checklist.cjs
 * Path: audit/run-1/area-C/16-checklist.cjs
 * Description: Area C: does the setup checklist's clip-bank item agree with the bank tab,
 *   per campaign? Audit-only.
 */
const { boot, campaign, clip, loadVideo, openBankTab, VID } = require("./lib.cjs");
const log = (...x) => console.log("[C16]", ...x);

async function bankItem(a) {
  await a.win.click("#ui-help-button");
  await a.win.waitForTimeout(700);
  const drawer = a.win.locator("#ui-help-drawer");
  // the checklist is collapsed behind a disclosure
  const toggles = await drawer.locator("button,summary").allInnerTexts();
  const idx = toggles.findIndex((t) => /Setup checklist/i.test(t));
  if (idx >= 0) {
    await drawer.locator("button,summary").nth(idx).click();
    await a.win.waitForTimeout(500);
  }
  const txt = await drawer.innerText();
  const i = txt.indexOf("clip bank");
  const out = i < 0 ? `(not found) ${txt.slice(0, 200).replace(/\n/g, " | ")}` : txt.slice(Math.max(0, i - 60), i + 220).replace(/\n/g, " | ");
  const shot = await a.shot("checklist");
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(400);
  return { out, shot };
}

(async () => {
  const a = await boot("C16-checklist", {
    "clipper.campaigns": [campaign("acme-q4", "Acme Q4"), campaign("beta-launch", "Beta Launch")],
    "clipper.activeCampaign": "acme-q4",
    "clipper.bank": { "acme-q4": { [VID]: [clip("A01", 60, 90), clip("A02", 120, 150), clip("A03", 200, 230)] } },
  });
  try {
    await loadVideo(a);
    await openBankTab(a);
    await a.win.waitForTimeout(400);
    log("Acme bank tab says:", JSON.stringify((await a.win.locator("#ui-col-clips").innerText()).split("\n").find((l) => /clips/.test(l))));
    const r1 = await bankItem(a);
    log("Acme checklist item:", JSON.stringify(r1.out), r1.shot);

    await a.win.click("#ui-campaign-chip");
    await a.win.locator('[role="option"]:has-text("Beta Launch")').first().click();
    await a.win.waitForTimeout(500);
    await openBankTab(a);
    log("Beta bank tab says:", JSON.stringify((await a.win.locator("#ui-col-clips").innerText()).split("\n").find((l) => /clips/.test(l))));
    const r2 = await bankItem(a);
    log("Beta checklist item:", JSON.stringify(r2.out), r2.shot);
    log("footer:", JSON.stringify((await a.win.locator("footer").innerText()).replace(/\n/g, " | ")));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 300));
  } catch (e) {
    console.error("FAIL", e);
    try { log("shot fail:", await a.shot("fail")); } catch {}
  } finally {
    await a.close();
  }
})();
