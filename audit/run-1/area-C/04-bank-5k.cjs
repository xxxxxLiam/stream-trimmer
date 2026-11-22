/**
 * File: 04-bank-5k.cjs
 * Path: audit/run-1/area-C/04-bank-5k.cjs
 * Description: Area C: a bank seeded with 5,000 rows under the active campaign. Measures
 *   first paint, then types one character into the bank search and reports whether the
 *   window survives. Audit-only.
 */
const { boot, campaign, clip, loadVideo, openBankTab, VID } = require("./lib.cjs");

const log = (...x) => console.log("[C04]", ...x);
const N = Number(process.argv[2] || 5000);

(async () => {
  const rows = Array.from({ length: N }, (_, i) =>
    clip(`S${String(i).padStart(4, "0")}`, i * 0.7, i * 0.7 + 0.5, {
      category: `cat${i % 7}`,
      tier: String((i % 3) + 1),
    }),
  );
  const a = await boot(`C04-bank-${N}`, {
    "clipper.campaigns": [campaign("acme", "Acme Q4")],
    "clipper.activeCampaign": "acme",
    "clipper.bank": { acme: { [VID]: rows } },
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
    const t0 = Date.now();
    await a.win.waitForFunction(
      (n) => new RegExp(`${n} clips`).test(document.querySelector("#ui-col-clips")?.innerText || ""),
      N,
      { timeout: 300000, polling: 200 },
    );
    log(`${N} rows: count line painted after`, Date.now() - t0, "ms");
    await a.win.waitForTimeout(1500);
    log("rows in DOM:", await a.win.locator("#ui-col-clips ul li").count());
    log("filter chips:", await a.win.locator('[aria-label="Filters"] button').count());
    log("shot:", await a.shot("seeded-bank"));
    log("state:", await alive());

    const search = a.win.locator('#ui-col-clips input[aria-label="Search the bank"]');
    log("typing one character into the bank search...");
    const k0 = Date.now();
    try {
      await search.type("S", { delay: 0, timeout: 60000 });
    } catch (e) {
      log("typing threw:", String(e).split("\n")[0]);
    }
    log("after 1 char,", Date.now() - k0, "ms,", await alive());

    const k1 = Date.now();
    try {
      await search.fill("S4999");
      await a.win.waitForFunction(
        (n) => new RegExp(`1 of ${n} clips`).test(document.querySelector("#ui-col-clips")?.innerText || ""),
        N,
        { timeout: 180000, polling: 200 },
      );
      log("search for one row resolved after", Date.now() - k1, "ms");
      log("shot:", await a.shot("search-one-row"));
    } catch (e) {
      log("search FAILED after", Date.now() - k1, "ms:", String(e).split("\n")[0]);
      log("state:", await alive());
    }
  } catch (e) {
    console.error("FAIL", e);
    log("state:", await alive());
  } finally {
    log("final state:", await alive());
    log("stderr tail:", JSON.stringify(a.logs.stderr.slice(-3)));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 500));
    await a.close();
  }
})();
