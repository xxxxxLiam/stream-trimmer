/**
 * File: 19-two-tabs-import.cjs
 * Path: audit/run-1/area-C/19-two-tabs-import.cjs
 * Description: Area C: open two video tabs FIRST (both banks empty, so no crash on open),
 *   then import into one of them. Audit-only.
 */
const { boot, campaign, loadVideo, openBankTab, importBlock, VID } = require("./lib.cjs");
const log = (...x) => console.log("[C19]", ...x);
const VID2 = "stub0000002";

(async () => {
  const a = await boot("C19-two-tabs", {
    "clipper.campaigns": [campaign("acme-q4", "Acme Q4")],
    "clipper.activeCampaign": "acme-q4",
  });
  const snap = async (tag) => {
    const s = await a.win.evaluate(() => ({
      root: document.querySelector("#root")?.children.length ?? -1,
      header: !!document.querySelector("header"),
    })).catch((e) => ({ error: String(e).split("\n")[0] }));
    log(tag, JSON.stringify(s));
    return s;
  };
  try {
    await loadVideo(a);
    await snap("tab1 loaded, empty bank:");
    await a.win.click('button[aria-label="New tab"]');
    await a.win.waitForTimeout(1500);
    await snap("after New tab (both banks empty):");
    await loadVideo(a, `https://www.youtube.com/watch?v=${VID2}`);
    await snap("tab2 video loaded:");
    try { log("shot pre-bank:", await a.shot("pre-bank")); } catch {}
    log("body text:", JSON.stringify((await a.win.locator("body").innerText()).slice(0, 400)));
    log("intercepting overlay:", await a.win.evaluate(() => {
      const el = document.querySelector("#clips-tab-bank");
      if (!el) return "no bank tab button";
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
      return top ? `${top.tagName}.${top.className}`.slice(0, 120) : "none";
    }));
    log("how many #clips-tab-bank elements are in the DOM:", await a.win.locator("#clips-tab-bank").count());
    await a.win.locator("#clips-tab-bank").last().scrollIntoViewIfNeeded();
    await a.win.locator("#clips-tab-bank").last().click();
    log("importing into tab 2...");
    let summary = "(threw)";
    try {
      const col = a.win.locator('#ui-col-clips').last();
      await col.locator('button:has-text("Import timestamps")').scrollIntoViewIfNeeded();
      await col.locator('button:has-text("Import timestamps")').click();
      const ta = col.locator('textarea[placeholder="Paste your timestamps here"]');
      await ta.waitFor({ timeout: 10000 });
      await ta.evaluate((el, v) => {
        const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
        setter.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      }, "A01 1:00-1:30 tab two hook");
      await a.win.waitForTimeout(300);
      await col.locator('button:has-text("Import 1")').first().click();
      await a.win.waitForTimeout(800);
      summary = (await col.innerText()).split("\n").find((l) => l.startsWith("Imported:")) || "(no summary)";
    } catch (e) {
      log("import threw:", String(e).split("\n")[0]);
    }
    log("summary:", summary);
    await a.win.waitForTimeout(2500);
    await snap("after importing with two tabs open:");
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 300));
    try { log("shot:", await a.shot("after-import-two-tabs")); } catch (e) { log("shot failed"); }
    log("bank on disk:", JSON.stringify(a.readState()["clipper.bank"]));
  } catch (e) {
    console.error("FAIL", e);
  } finally {
    try { await a.close(); } catch {}
  }
})();
