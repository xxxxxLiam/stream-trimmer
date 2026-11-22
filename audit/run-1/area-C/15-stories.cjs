/**
 * File: 15-stories.cjs
 * Path: audit/run-1/area-C/15-stories.cjs
 * Description: Area C step 4 — realistic user stories, run end to end against the real app.
 *   Each story prints what the user would see. Audit-only.
 */
const { boot, campaign, loadVideo, openBankTab, importBlock, bankOf, VID } = require("./lib.cjs");

const log = (...x) => console.log("[C15]", ...x);
const colText = (a) => a.win.locator("#ui-col-clips").innerText();
const line = async (a, re) => (await colText(a)).split("\n").find((l) => re.test(l));

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

(async () => {
  const a = await boot("C15-stories", { "clipper.dataDirConfirmed": true });
  try {
    await loadVideo(a);

    // ---- 1. Monday: new client, new campaign, paste the week's timestamps
    await createCampaign(a, "Northwind Q1");
    await openBankTab(a);
    const week = [
      "Hook moments:",
      "T1-A01 1:00-1:30 the opening line",
      "T1-A02 2:10-2:45 the number everyone quotes",
      "Payoff:",
      "T2-A03 10:00-10:40 the reveal",
      "A04 12:00-12:50 | objection | T3",
    ].join("\n");
    log("1. first import:", await importBlock(a, week));
    log("1. count line:", await line(a, /clips/), "| chips:", JSON.stringify(await a.win.locator('[aria-label="Filters"] button').allInnerTexts()));
    log("1. shot:", await a.shot("story1-first-import"));

    // ---- 2. imports the next client's list into the wrong campaign, notices, switches, re-imports
    await createCampaign(a, "Southbay Launch");
    await switchTo(a, "Northwind Q1"); // the mistake: still on Northwind
    const southbay = ["S01 20:00-20:30 southbay hook", "S02 21:00-21:40 southbay payoff"].join("\n");
    log("2. imported Southbay's list while Northwind was active:", await importBlock(a, southbay));
    log("2. Northwind now shows:", await line(a, /clips/));
    log("2. shot:", await a.shot("story2-wrong-campaign"));
    // notices and cleans up: how many actions?
    const removeButtons = await a.win.locator('#ui-col-clips button[aria-label^="Remove S"]').count();
    log("2. ways to undo the whole import:", JSON.stringify(
      (await a.win.locator("#ui-col-clips button").allInnerTexts()).filter((t) => /undo|clear|remove all/i.test(t)),
    ), "| per-row Remove buttons to click:", removeButtons);
    for (let i = 0; i < removeButtons; i++) {
      await a.win.locator('#ui-col-clips button[aria-label^="Remove S"]').first().click();
      await a.win.waitForTimeout(200);
    }
    log("2. after cleaning up by hand:", await line(a, /clips/));
    await switchTo(a, "Southbay Launch");
    log("2. re-imported into the right campaign:", await importBlock(a, southbay));
    log("2. Southbay now shows:", await line(a, /clips/));
    log("2. shot:", await a.shot("story2-fixed"));

    // ---- 3. pastes the same list again because they are not sure it saved
    log("3. same list again:", await importBlock(a, southbay), "->", await line(a, /clips/));

    // ---- 4. pastes a chapter list copied from the video description
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    const ta = a.win.locator('textarea[placeholder="Paste your timestamps here"]');
    await ta.evaluate((el, v) => {
      const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      s.call(el, v);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, "0:00 intro\n3:15 the hook\n9:40 the payoff\n22:05 outro");
    await a.win.waitForTimeout(300);
    log("4. chapter list from a description ->", JSON.stringify((await a.win.locator('[aria-label="What was understood"]').innerText()).split("\n").slice(0, 4)));
    log("4. shot:", await a.shot("story4-chapter-list"));
    await a.win.click('#ui-col-clips button:has-text("Cancel")');

    // ---- 5. half the list is notes from the doc
    const messy = [
      "Notes for the editor:",
      "- use the wide shot",
      "T1-M01 30:00-30:40 the apology",
      "TBC 31:00 ish",
      "T2-M02 33:00-33:50 the laugh",
    ].join("\n");
    log("5. messy doc paste:", await importBlock(a, messy));
    log("5. count:", await line(a, /clips/));
    log("5. shot:", await a.shot("story5-messy"));

    // ---- 6. sort by tier to cut the T1s first
    await a.win.click('#ui-col-clips button:has-text("Sort by tier")');
    await a.win.waitForTimeout(300);
    const order = (await colText(a)).split("\n").filter((l) => /^(T\d-)?[A-Z]\d\d /.test(l.trim()));
    log("6. order after Sort by tier:", JSON.stringify(order));
    log("6. shot:", await a.shot("story6-sorted"));

    // ---- 7. search for the clip promised to the client
    const search = a.win.locator('#ui-col-clips input[aria-label="Search the bank"]');
    await search.fill("laugh");
    await a.win.waitForTimeout(300);
    log("7. search 'laugh':", await line(a, /of \d+ clips/), "| rows:", await a.win.locator("#ui-col-clips ul li").count());
    await search.fill("");

    // ---- 8. filter by a category chip; the count must match the rows
    const chips = await a.win.locator('[aria-label="Filters"] button').allInnerTexts();
    log("8. chips:", JSON.stringify(chips));
    if (chips.length) {
      await a.win.locator('[aria-label="Filters"] button').first().click();
      await a.win.waitForTimeout(300);
      const l8 = await line(a, /of \d+ clips/);
      const rows8 = await a.win.locator("#ui-col-clips ul li").count();
      log("8. filtered by", JSON.stringify(chips[0]), "->", l8, "| rows on screen:", rows8,
        "| agree:", l8 && Number(l8.trim().split(" ")[0]) === rows8);
      log("8. shot:", await a.shot("story8-filter"));
      await a.win.locator('#ui-col-clips button:has-text("Clear filters")').click();
      await a.win.waitForTimeout(200);
    }

    // ---- 9. a clip is mis-categorised; try to fix it without re-pasting
    const fixControls = await a.win.evaluate(() => {
      const li = [...document.querySelectorAll("#ui-col-clips ul li")][0];
      return li ? [...li.querySelectorAll("button,input,select")].map((e) => e.getAttribute("aria-label") || e.textContent.trim()) : null;
    });
    log("9. controls offered to re-categorise a row:", JSON.stringify(fixControls));
    log("9. fixed by re-pasting the line instead:", await importBlock(a, "M01 30:00-30:40 the apology | repentance | T1"));
    log("9. row now:", JSON.stringify((await colText(a)).split("\n").filter((l) => /repentance|apology/.test(l))));

    // ---- 10. delete a row today, re-import the same block tomorrow
    await a.win.locator('#ui-col-clips button[aria-label*="M02"]').first().click();
    await a.win.waitForTimeout(300);
    log("10. after deleting M02:", await line(a, /clips/));
    log("10. rows now:", JSON.stringify(bankOf(a, "southbay-launch").map((c) => c.id)));
    log("10. re-importing the same block:", await importBlock(a, messy));
    log("10. M02 is back:", (await colText(a)).includes("the laugh"));

    // ---- 11. the client renames the project mid-week
    await openMenu(a);
    await a.win.click('button[aria-label="Edit Southbay Launch"]');
    await a.win.locator("form input.field").first().fill("Southbay Spring");
    await a.win.click('form button:has-text("Save")');
    await a.win.waitForTimeout(500);
    await openBankTab(a);
    log("11. after renaming, chip:", (await a.win.locator("#ui-campaign-chip").innerText()).replace(/\n/g, " "),
      "| bank:", await line(a, /clips/),
      "| id kept:", JSON.stringify(a.readState()["clipper.campaigns"].map((c) => [c.id, c.name])));
    log("11. shot:", await a.shot("story11-renamed"));

    // ---- 12. switches campaign with the import box open
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    await a.win.locator('textarea[placeholder="Paste your timestamps here"]').evaluate((el) => {
      const s = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      s.call(el, "X01 40:00-40:30 half-typed note the user has not confirmed yet");
      el.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await a.win.waitForTimeout(250);
    await switchTo(a, "Northwind Q1");
    await switchTo(a, "Southbay Spring");
    const stillThere = await a.win.locator('textarea[placeholder="Paste your timestamps here"]').count();
    log("12. after a there-and-back switch, the paste is", stillThere ? "still there" : "GONE");
    log("12. shot:", await a.shot("story12-paste-gone"));

    log("final banks:", JSON.stringify(Object.fromEntries(Object.entries(a.readState()["clipper.bank"]).map(([k, v]) => [k, Object.fromEntries(Object.entries(v).map(([vid, rows]) => [vid, rows.map((r) => r.id)]))]))));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 400));
  } catch (e) {
    console.error("FAIL", e);
    try { log("shot fail:", await a.shot("fail")); } catch {}
  } finally {
    await a.close();
  }
})();
