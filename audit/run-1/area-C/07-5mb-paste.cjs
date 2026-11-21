/**
 * File: 07-5mb-paste.cjs
 * Path: audit/run-1/area-C/07-5mb-paste.cjs
 * Description: Area C: paste 5MB of prose with no timestamps into the import box and see
 *   what the app does. Also a 5MB paste that IS timestamps. Audit-only.
 */
const { boot, campaign, loadVideo, openBankTab } = require("./lib.cjs");

const log = (...x) => console.log("[C07]", ...x);
const TA = 'textarea[placeholder="Paste your timestamps here"]';
const MODE = process.argv[2] || "prose";

(async () => {
  const a = await boot(`C07-5mb-${MODE}`, {
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
  try {
    await loadVideo(a);
    await openBankTab(a);
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    await a.win.locator(TA).waitFor({ timeout: 15000 });

    const text =
      MODE === "prose"
        ? "the quick brown fox jumped over the lazy dog and kept going\n".repeat(85000)
        : Array.from({ length: 85000 }, (_, i) => `${(i % 3000) + 0.1}-${(i % 3000) + 0.6} line ${i} of a very long pasted list`).join("\n");
    log("mode", MODE, "bytes", text.length, "lines", text.split("\n").length);

    const t0 = Date.now();
    await a.win.locator(TA).evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, text);
    log("value set + input dispatched, returned after", Date.now() - t0, "ms");

    let painted = false;
    try {
      await a.win.waitForFunction(
        () => {
          const u = document.querySelector('[aria-label="What was understood"]');
          return !!u && /clips,/.test(u.innerText);
        },
        null,
        { timeout: 300000, polling: 1000 },
      );
      painted = true;
    } catch (e) {
      log("no preview within 300s:", String(e).split("\n")[0]);
    }
    log("preview painted:", painted, "after", Date.now() - t0, "ms;", await alive());
    if (painted) {
      const u = await a.win.locator('[aria-label="What was understood"]').innerText();
      log("headline:", JSON.stringify(u.split("\n").slice(0, 3)));
      log("error <li> count in DOM:", await a.win.locator('[role="alert"] li').count());
    }
    try {
      log("shot:", await a.shot("5mb"));
    } catch (e) {
      log("screenshot failed:", String(e).split("\n")[0]);
    }
    // can the user still cancel out of it?
    const c0 = Date.now();
    try {
      await a.win.locator('#ui-col-clips button:has-text("Cancel")').click({ timeout: 120000 });
      await a.win.waitForFunction(() => !document.querySelector('textarea[placeholder="Paste your timestamps here"]'), null, { timeout: 120000, polling: 500 });
      log("Cancel worked after", Date.now() - c0, "ms");
    } catch (e) {
      log("Cancel FAILED after", Date.now() - c0, "ms:", String(e).split("\n")[0]);
    }
    log("final:", await alive());
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 600));
    log("console tail:", JSON.stringify(a.logs.console.slice(-3)).slice(0, 600));
  } catch (e) {
    console.error("FAIL", e);
    log("state:", await alive());
  } finally {
    await a.close();
  }
})();
