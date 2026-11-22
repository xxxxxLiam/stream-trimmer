/**
 * File: 05-huge-paste.cjs
 * Path: audit/run-1/area-C/05-huge-paste.cjs
 * Description: Area C: import 5,000 lines in the real app, then search the resulting bank,
 *   then paste 5MB of prose with no timestamps. Each step guarded so a dead renderer is
 *   reported rather than crashing the script. Audit-only.
 */
const { boot, campaign, loadVideo, openBankTab } = require("./lib.cjs");

const log = (...x) => console.log("[C05]", ...x);
const TA = 'textarea[placeholder="Paste your timestamps here"]';

(async () => {
  const a = await boot("C05-huge", {
    "clipper.campaigns": [campaign("acme", "Acme Q4")],
    "clipper.activeCampaign": "acme",
  });
  const alive = async () => {
    if (a.win.isClosed()) return "window CLOSED";
    try {
      await a.win.evaluate(() => 1);
      return "alive";
    } catch (e) {
      return "DEAD: " + String(e).split("\n")[0];
    }
  };
  const setText = async (v) => {
    await a.win.locator(TA).waitFor({ timeout: 15000 });
    await a.win.locator(TA).evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, v);
  };
  const text = () => a.win.locator("#ui-col-clips").innerText();

  try {
    await loadVideo(a);
    await openBankTab(a);

    // 1. 5,000 lines
    const lines = Array.from({ length: 5000 }, (_, i) => `${(i * 0.7).toFixed(2)}-${(i * 0.7 + 0.5).toFixed(2)} line ${i}`).join("\n");
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    const p0 = Date.now();
    await setText(lines);
    await a.win.waitForFunction(() => /5000 clips/.test(document.body.innerText), null, { timeout: 120000, polling: 100 });
    log("5k lines parsed+previewed in", Date.now() - p0, "ms");
    const i0 = Date.now();
    await a.win.locator('#ui-col-clips button:has-text("Import 5000")').first().click();
    await a.win.waitForFunction(() => /Imported: /.test(document.querySelector("#ui-col-clips")?.innerText || ""), null, { timeout: 600000, polling: 200 });
    log("5k import committed+painted in", Date.now() - i0, "ms;", await alive());
    log("shot:", await a.shot("after-5k-import"));

    // 2. search that bank
    const s0 = Date.now();
    try {
      await a.win.locator('#ui-col-clips input[aria-label="Search the bank"]').type("line 4999", { delay: 20, timeout: 120000 });
      await a.win.waitForFunction(() => /1 of 5000 clips/.test(document.querySelector("#ui-col-clips")?.innerText || ""), null, { timeout: 300000, polling: 200 });
      log("typing a 9-character search took", Date.now() - s0, "ms;", await alive());
      log("shot:", await a.shot("after-search"));
    } catch (e) {
      log("SEARCH FAILED after", Date.now() - s0, "ms:", String(e).split("\n")[0], "|", await alive());
      log("stderr tail:", JSON.stringify(a.logs.stderr.slice(-4)));
      log("console tail:", JSON.stringify(a.logs.console.slice(-6)));
      return;
    }
    await a.win.locator('#ui-col-clips input[aria-label="Search the bank"]').fill("");
    await a.win.waitForTimeout(2000);

    // 3. 5MB of prose, no timestamps at all
    const prose = "the quick brown fox jumped over the lazy dog and kept going\n".repeat(85000);
    log("prose bytes:", prose.length, "lines:", prose.split("\n").length);
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    const q0 = Date.now();
    try {
      await setText(prose);
      log("setting the value returned after", Date.now() - q0, "ms");
      await a.win.waitForFunction(
        () => /lines not understood/.test(document.querySelector("#ui-col-clips")?.innerText || ""),
        null,
        { timeout: 240000, polling: 500 },
      );
      log("5MB paste: preview painted after", Date.now() - q0, "ms;", await alive());
      log("5MB paste: error list rows in DOM:", await a.win.locator('[role="alert"] li').count());
      log("5MB paste: shot", await a.shot("5mb-paste"));
    } catch (e) {
      log("5MB PASTE FAILED after", Date.now() - q0, "ms:", String(e).split("\n")[0], "|", await alive());
      log("stderr tail:", JSON.stringify(a.logs.stderr.slice(-4)));
      log("console tail:", JSON.stringify(a.logs.console.slice(-6)));
    }
  } catch (e) {
    console.error("FAIL", e);
    log("state:", await alive());
  } finally {
    log("final:", await alive());
    await a.close();
  }
})();
