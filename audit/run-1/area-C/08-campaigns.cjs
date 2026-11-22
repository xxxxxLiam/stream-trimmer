/**
 * File: 08-campaigns.cjs
 * Path: audit/run-1/area-C/08-campaigns.cjs
 * Description: Area C: create / rename / delete a campaign through the real header popover,
 *   including rename to an existing name, to empty, to 500 characters and to an emoji; and
 *   delete-then-recreate with the same name over a bank that has rows. Audit-only.
 */
const { boot, campaign, clip, loadVideo, openBankTab, VID } = require("./lib.cjs");

const log = (...x) => console.log("[C08]", ...x);

const openMenu = async (a) => {
  if (await a.win.locator('[role="dialog"][aria-label="Campaign"]').count()) return;
  await a.win.click("#ui-campaign-chip");
  await a.win.locator('[role="dialog"][aria-label="Campaign"]').waitFor({ timeout: 10000 });
};
const closeMenu = async (a) => {
  if (await a.win.locator('[role="dialog"][aria-label="Campaign"]').count()) {
    await a.win.keyboard.press("Escape").catch(() => {});
    await a.win.mouse.click(700, 300).catch(() => {});
  }
};
const menuText = async (a) => (await a.win.locator('[role="dialog"][aria-label="Campaign"]').innerText()).replace(/\n/g, " | ");
const chipText = async (a) => (await a.win.locator("#ui-campaign-chip").innerText()).replace(/\n/g, " ");
const footerText = async (a) => (await a.win.locator("footer").innerText()).replace(/\n/g, " | ");

(async () => {
  const a = await boot("C08-campaigns", {
    "clipper.campaigns": [campaign("acme", "Acme Q4")],
    "clipper.activeCampaign": "acme",
    "clipper.bank": { acme: { [VID]: [clip("A01", 60, 90, { category: "hook", tier: "1" })] } },
  });
  try {
    await loadVideo(a);
    await openBankTab(a);
    log("start chip:", await chipText(a), "| footer:", await footerText(a));

    // ---- create a campaign through the UI
    await openMenu(a);
    await a.win.click('button:has-text("New campaign")');
    await a.win.locator('form input.field').first().fill("Beta Launch");
    log("create form folders:", JSON.stringify((await a.win.locator("form").innerText()).replace(/\n/g, " | ")));
    await a.win.click('form button:has-text("Create")');
    await a.win.waitForTimeout(400);
    log("after create, chip:", await chipText(a));
    log("after create, campaigns in state:", JSON.stringify(a.readState()["clipper.campaigns"].map((c) => ({ id: c.id, name: c.name, clipsDir: c.clipsDir, dataDir: c.dataDir }))));
    log("after create, footer:", await footerText(a));
    log("shot:", await a.shot("created-beta"));

    // ---- rename Beta to the name the other campaign already has
    await openMenu(a);
    await a.win.click('button[aria-label="Edit Beta Launch"]');
    await a.win.locator("form input.field").first().fill("Acme Q4");
    await a.win.click('form button:has-text("Save")');
    await a.win.waitForTimeout(400);
    await openMenu(a);
    log("rename to an existing name -> menu now:", await menuText(a));
    log("rename to an existing name -> ids/names:", JSON.stringify(a.readState()["clipper.campaigns"].map((c) => [c.id, c.name])));
    log("shot:", await a.shot("duplicate-names"));
    await closeMenu(a);

    // ---- rename to empty
    await openMenu(a);
    await a.win.click('button[aria-label="Edit Acme Q4"] >> nth=1');
    await a.win.locator("form input.field").first().fill("");
    await a.win.click('form button:has-text("Save")');
    await a.win.waitForTimeout(300);
    const problem = await a.win.locator('form [role="alert"]').count();
    log("rename to empty -> blocked with a message?", problem > 0, JSON.stringify(problem ? await a.win.locator('form [role="alert"]').innerText() : ""));
    log("shot:", await a.shot("rename-empty"));

    // ---- rename to 500 characters
    const long = "Q4 brand refresh for a client with a very long name ".repeat(10).slice(0, 500);
    await a.win.locator("form input.field").first().fill(long);
    await a.win.click('form button:has-text("Save")');
    await a.win.waitForTimeout(500);
    log("500-char name -> chip:", JSON.stringify((await chipText(a)).slice(0, 80)), "len:", (await chipText(a)).length);
    const hdr = await a.win.evaluate(() => {
      const h = document.querySelector("header");
      return { scrollW: h.scrollWidth, clientW: h.clientWidth, bodyScrollW: document.body.scrollWidth, bodyClientW: document.body.clientWidth };
    });
    log("500-char name -> header metrics:", JSON.stringify(hdr));
    log("shot:", await a.shot("long-name-header"));
    await openMenu(a);
    log("500-char name -> menu row:", JSON.stringify((await menuText(a)).slice(0, 200)));
    log("shot:", await a.shot("long-name-menu"));

    // ---- rename to an emoji
    await a.win.click(`button[aria-label^="Edit ${long.slice(0, 20)}"]`).catch(async () => {
      const edits = a.win.locator('button:has-text("Edit")');
      await edits.nth((await edits.count()) - 1).click();
    });
    await a.win.locator("form input.field").first().fill("🔥🔥🔥");
    await a.win.click('form button:has-text("Save")');
    await a.win.waitForTimeout(400);
    log("emoji name -> chip:", JSON.stringify(await chipText(a)));
    log("emoji name -> state:", JSON.stringify(a.readState()["clipper.campaigns"].map((c) => [c.id, c.name, c.prefix])));
    log("shot:", await a.shot("emoji-name"));
    await closeMenu(a);

    // ---- delete the campaign that owns bank rows, then recreate it with the same name
    await a.win.click("#ui-campaign-chip");
    await a.win.click('[role="option"]:has-text("Acme Q4")');
    await a.win.waitForTimeout(400);
    log("back on Acme, bank rows on screen:", (await a.win.locator("#ui-col-clips").innerText()).split("\n").find((l) => /clips/.test(l)));
    const before = JSON.stringify(a.readState()["clipper.bank"]);
    log("bank before delete:", before);
    await openMenu(a);
    await a.win.click('button[aria-label="Remove Acme Q4"] >> nth=0');
    log("first click on Remove shows:", JSON.stringify((await menuText(a)).slice(0, 200)));
    await a.win.click('button:has-text("Confirm") >> nth=0');
    await a.win.waitForTimeout(500);
    log("after delete, campaigns:", JSON.stringify(a.readState()["clipper.campaigns"].map((c) => [c.id, c.name])));
    log("after delete, bank in settings.json:", JSON.stringify(a.readState()["clipper.bank"]));
    log("after delete, chip:", await chipText(a));
    log("shot:", await a.shot("after-delete"));

    // recreate with the same name
    await openMenu(a);
    await a.win.click('button:has-text("New campaign")');
    await a.win.locator("form input.field").first().fill("Acme Q4");
    await a.win.click('form button:has-text("Create")');
    await a.win.waitForTimeout(600);
    await openBankTab(a);
    await a.win.waitForTimeout(400);
    const colText = await a.win.locator("#ui-col-clips").innerText();
    log("recreated same name -> id:", JSON.stringify(a.readState()["clipper.campaigns"].map((c) => [c.id, c.name])));
    log("recreated same name -> bank view:", JSON.stringify(colText.split("\n").slice(0, 12)));
    log("recreated same name -> OLD ROWS BACK?", colText.includes("A01"));
    log("shot:", await a.shot("recreated-same-name"));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 400));
  } catch (e) {
    console.error("FAIL", e);
    try { log("shot fail:", await a.shot("fail")); } catch {}
  } finally {
    await a.close();
  }
})();
