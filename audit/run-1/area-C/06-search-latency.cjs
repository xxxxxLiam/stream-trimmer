/**
 * File: 06-search-latency.cjs
 * Path: audit/run-1/area-C/06-search-latency.cjs
 * Description: Area C: per-keystroke latency of the bank search at a given bank size.
 *   Usage: node 06-search-latency.cjs <rows>. Audit-only.
 */
const { boot, campaign, clip, loadVideo, openBankTab, VID } = require("./lib.cjs");

const N = Number(process.argv[2] || 5000);
const log = (...x) => console.log(`[C06:${N}]`, ...x);

(async () => {
  const rows = Array.from({ length: N }, (_, i) =>
    clip(`S${String(i).padStart(4, "0")}`, i * 0.5, i * 0.5 + 0.4, {
      category: `cat${i % 7}`,
      tier: String((i % 3) + 1),
    }),
  );
  const a = await boot(`C06-latency-${N}`, {
    "clipper.campaigns": [campaign("acme", "Acme Q4")],
    "clipper.activeCampaign": "acme",
    "clipper.bank": { acme: { [VID]: rows } },
  });
  try {
    await loadVideo(a);
    await openBankTab(a);
    await a.win.waitForFunction(
      (n) => new RegExp(`${n} clips`).test(document.querySelector("#ui-col-clips")?.innerText || ""),
      N,
      { timeout: 300000, polling: 200 },
    );
    await a.win.waitForTimeout(1000);
    const search = a.win.locator('#ui-col-clips input[aria-label="Search the bank"]');
    await search.click();
    const word = "S4999";
    const times = [];
    for (const ch of word) {
      const t0 = Date.now();
      await a.win.keyboard.press(`Key${ch.toUpperCase()}`.replace(/Key(\d)/, "Digit$1"), { timeout: 120000 }).catch(async () => {
        await a.win.keyboard.type(ch);
      });
      // wait until the main thread can answer again = the re-render finished
      await a.win.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      times.push(Date.now() - t0);
      log("keystroke", JSON.stringify(ch), "->", times[times.length - 1], "ms");
    }
    log("total for", word.length, "keystrokes:", times.reduce((x, y) => x + y, 0), "ms; per key:", JSON.stringify(times));
    log("count line now:", (await a.win.locator("#ui-col-clips").innerText()).split("\n").find((l) => /clips/.test(l)));
    log("shot:", await a.shot("after-typing"));
  } catch (e) {
    console.error("FAIL", e);
    try {
      log("shot fail:", await a.shot("fail"));
    } catch {}
  } finally {
    await a.close();
  }
})();
