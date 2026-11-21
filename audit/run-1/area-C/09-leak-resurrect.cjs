/**
 * File: 09-leak-resurrect.cjs
 * Path: audit/run-1/area-C/09-leak-resurrect.cjs
 * Description: Area C: (1) two campaigns created through the UI, each with its own bank,
 *   switched between repeatedly, asserting each view shows only its own rows; (2) delete a
 *   campaign that owns rows, recreate it with the same name, and see whether the old rows
 *   come back. Audit-only.
 */
const { boot, loadVideo, openBankTab, importBlock, VID } = require("./lib.cjs");

const log = (...x) => console.log("[C09]", ...x);
let fails = 0;
const check = (ok, msg) => {
  if (!ok) fails++;
  log(ok ? "PASS" : "**FAIL**", msg);
};

const openMenu = async (a) => {
  if (!(await a.win.locator('[role="dialog"][aria-label="Campaign"]').count())) await a.win.click("#ui-campaign-chip");
  await a.win.locator('[role="dialog"][aria-label="Campaign"]').waitFor({ timeout: 10000 });
};
async function createCampaign(a, name) {
  await openMenu(a);
  await a.win.click('button:has-text("New campaign")');
  await a.win.locator("form input.field").first().fill(name);
  await a.win.click('form button:has-text("Create")');
  await a.win.waitForTimeout(500);
}
async function switchTo(a, name) {
  await openMenu(a);
  await a.win.locator(`[role="option"]:has-text("${name}")`).first().click();
  await a.win.waitForTimeout(400);
  await openBankTab(a);
  await a.win.waitForTimeout(200);
}
const colText = (a) => a.win.locator("#ui-col-clips").innerText();

(async () => {
  const a = await boot("C09-leak", { "clipper.dataDirConfirmed": true });
  try {
    await loadVideo(a);
    await createCampaign(a, "Acme Q4");
    await openBankTab(a);
    log("import into Acme:", await importBlock(a, "A01 1:00-1:30 acme hook | hook | T1\nA02 2:00-2:40 acme payoff | payoff | T2"));
    await createCampaign(a, "Beta Launch");
    await openBankTab(a);
    log("import into Beta:", await importBlock(a, "B91 5:00-5:30 beta hook | promo | T3"));
    log("state:", JSON.stringify(a.readState()["clipper.bank"]));

    // ---- switch back and forth 4 times, assert what each view shows
    for (let round = 1; round <= 4; round++) {
      await switchTo(a, "Acme Q4");
      let t = await colText(a);
      check(t.includes("A01") && t.includes("A02") && !t.includes("B91") && !t.includes("beta hook"),
        `round ${round}: Acme view shows only Acme rows (${JSON.stringify(t.split("\n").filter((l) => /^[AB]\d|clips$|clips,/.test(l.trim())).slice(0, 6))})`);
      check(/\b2 clips\b/.test(t), `round ${round}: Acme count line says 2 clips`);
      const acmeChips = await a.win.locator('[aria-label="Filters"] button').allInnerTexts();
      check(!acmeChips.includes("promo"), `round ${round}: Acme filter chips carry no Beta category (${JSON.stringify(acmeChips)})`);

      await switchTo(a, "Beta Launch");
      t = await colText(a);
      check(t.includes("B91") && !t.includes("A01") && !t.includes("acme hook"),
        `round ${round}: Beta view shows only Beta rows`);
      check(/\b1 clips\b/.test(t), `round ${round}: Beta count line says 1 clip(s)`);
      const betaChips = await a.win.locator('[aria-label="Filters"] button').allInnerTexts();
      check(!betaChips.includes("hook"), `round ${round}: Beta filter chips carry no Acme category (${JSON.stringify(betaChips)})`);
    }
    log("shot:", await a.shot("beta-view"));
    await switchTo(a, "Acme Q4");
    log("shot:", await a.shot("acme-view"));

    // ---- delete Acme (which owns rows), then recreate it with the same name
    const bankBefore = a.readState()["clipper.bank"];
    log("bank before delete:", JSON.stringify(bankBefore));
    await openMenu(a);
    await a.win.locator('button[aria-label="Remove Acme Q4"]').click();
    await a.win.locator('button:has-text("Confirm")').click();
    await a.win.waitForTimeout(600);
    const bankAfter = a.readState()["clipper.bank"];
    log("campaigns after delete:", JSON.stringify(a.readState()["clipper.campaigns"].map((c) => [c.id, c.name])));
    log("bank after delete:", JSON.stringify(bankAfter));
    check(!bankAfter["acme-q4"], "deleting the campaign also removed its bank rows from clipper.bank");
    log("shot:", await a.shot("after-delete-acme"));

    await createCampaign(a, "Acme Q4");
    await openBankTab(a);
    await a.win.waitForTimeout(500);
    const t = await colText(a);
    log("recreated id:", JSON.stringify(a.readState()["clipper.campaigns"].map((c) => [c.id, c.name])));
    log("recreated bank view:", JSON.stringify(t.split("\n").slice(0, 10)));
    check(!t.includes("A01") && !t.includes("acme hook"), "recreating a campaign with the same name does NOT bring the deleted rows back");
    log("shot:", await a.shot("recreated-acme"));

    log(fails === 0 ? "ALL CHECKS PASSED" : `${fails} CHECK(S) FAILED`);
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 400));
  } catch (e) {
    console.error("FAIL", e);
    try { log("shot fail:", await a.shot("fail")); } catch {}
  } finally {
    await a.close();
  }
})();
