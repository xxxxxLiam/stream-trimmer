/**
 * File: 03-scale.cjs
 * Path: audit/run-1/area-C/03-scale.cjs
 * Description: Area C state-over-time: a 5,000 line paste, a 5MB paste, and a bank seeded
 *   with 5,000 rows (plus an older row shape and a malformed campaign entry). Measures what
 *   the user feels: parse latency, import latency, first paint, keystroke latency.
 *   Audit-only.
 */
const { boot, campaign, clip, loadVideo, openBankTab, bankOf, VID } = require("./lib.cjs");

const log = (...x) => console.log("[C03]", ...x);
const TA = 'textarea[placeholder="Paste your timestamps here"]';

async function setText(a, v) {
  const ta = a.win.locator(TA);
  await ta.waitFor({ timeout: 15000 });
  await ta.evaluate((el, val) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
}

/** How long until the preview headline matches, i.e. the parse landed and painted. */
async function waitPreview(a, re, timeout = 180000) {
  const t0 = Date.now();
  await a.win.waitForFunction(
    (src) => {
      const u = document.querySelector('[aria-label="What was understood"]');
      return !!u && new RegExp(src).test(u.innerText);
    },
    re.source,
    { timeout, polling: 100 },
  );
  return Date.now() - t0;
}

/** Click something and time how long the main thread takes to answer a trivial request after. */
async function uiLatency(a) {
  const t0 = Date.now();
  await a.win.evaluate(() => new Promise((r) => requestAnimationFrame(() => r(1))));
  return Date.now() - t0;
}

(async () => {
  // ---------- part 1: huge pastes into the real importer ----------
  const a = await boot("C03-paste", {
    "clipper.campaigns": [campaign("acme", "Acme Q4")],
    "clipper.activeCampaign": "acme",
  });
  try {
    await loadVideo(a);
    await openBankTab(a);

    const lines5k = Array.from({ length: 5000 }, (_, i) => {
      const s = (i * 0.7).toFixed(2);
      const e = (i * 0.7 + 0.5).toFixed(2);
      return `${s}-${e} line ${i}`;
    }).join("\n");
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    await setText(a, lines5k);
    const parseMs = await waitPreview(a, /5000 clips/);
    log("5k lines: preview appeared after", parseMs, "ms");
    log("5k lines: shot", await a.shot("5k-preview"));

    const t0 = Date.now();
    await a.win.locator('#ui-col-clips button:has-text("Import 5000")').first().click({ timeout: 30000 });
    await a.win.waitForFunction(
      () => /Imported: /.test(document.querySelector("#ui-col-clips")?.innerText || ""),
      null,
      { timeout: 600000, polling: 250 },
    );
    const importMs = Date.now() - t0;
    log("5k lines: import+render took", importMs, "ms");
    log("5k lines: rows persisted", bankOf(a, "acme").length);
    log("5k lines: summary", (await a.win.locator("#ui-col-clips").innerText()).split("\n").find((l) => l.startsWith("Imported:")));
    log("5k lines: shot", await a.shot("5k-bank"));

    // keystroke latency in the search box with 5,000 rows on screen
    const search = a.win.locator('#ui-col-clips input[aria-label="Search the bank"]');
    const k0 = Date.now();
    await search.fill("line 4999");
    await a.win.waitForFunction(
      () => /1 of 5000 clips/.test(document.querySelector("#ui-col-clips")?.innerText || ""),
      null,
      { timeout: 300000, polling: 100 },
    );
    log("5k rows: one search keystroke -> filtered list took", Date.now() - k0, "ms");
    log("5k rows: shot", await a.shot("5k-search"));
    await search.fill("");
    log("5k rows: rAF latency", await uiLatency(a), "ms");

    // ---------- 5MB paste of prose with no timestamps ----------
    const prose = ("the quick brown fox jumped over the lazy dog and kept going\n").repeat(85000);
    log("5MB paste: bytes", prose.length);
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    const p0 = Date.now();
    await setText(a, prose);
    let state = "painted";
    try {
      await waitPreview(a, /lines not understood/, 240000);
    } catch (e) {
      state = "never painted a preview within 240s: " + e.message.split("\n")[0];
    }
    log("5MB paste:", state, "after", Date.now() - p0, "ms");
    log("5MB paste: rAF latency", await uiLatency(a), "ms");
    log("5MB paste: shot", await a.shot("5mb-paste"));
    log("5MB paste: pageErrors", JSON.stringify(a.logs.pageErrors).slice(0, 600));
    log("5MB paste: console tail", JSON.stringify(a.logs.console.slice(-4)));
  } catch (e) {
    console.error("FAIL part1", e);
    log("shot fail:", await a.shot("fail-part1"));
  } finally {
    await a.close();
  }

  // ---------- part 2: a bank seeded with 5,000 rows, an old row shape, a malformed campaign ----------
  const seededRows = Array.from({ length: 5000 }, (_, i) =>
    clip(`S${String(i).padStart(4, "0")}`, i * 0.7, i * 0.7 + 0.5, {
      category: `cat${i % 7}`,
      tier: String((i % 3) + 1),
    }),
  );
  // older shape: no category, no tier, no status at all
  const oldShape = [
    { id: "OLD1", label: "from an older version", segments: [{ start: 10, end: 20 }] },
    { id: "OLD2", segments: [{ start: 30, end: 40 }] },
  ];
  const b = await boot("C03-seeded", {
    "clipper.campaigns": [
      campaign("acme", "Acme Q4"),
      null,
      { id: "broken" },
      { name: "no id here" },
      "a string where a campaign should be",
      campaign("beta", "Beta Launch"),
    ],
    "clipper.activeCampaign": "acme",
    "clipper.bank": {
      acme: { [VID]: [...seededRows, ...oldShape] },
      "a-campaign-that-no-longer-exists": { [VID]: [clip("GHOST", 5, 9)] },
    },
  });
  try {
    const t0 = Date.now();
    await b.win.waitForFunction(
      () => /clips/.test(document.querySelector("#ui-col-clips")?.innerText || ""),
      null,
      { timeout: 120000, polling: 100 },
    );
    log("seeded: clips column first text after", Date.now() - t0, "ms");
    await loadVideo(b);
    await openBankTab(b);
    const t1 = Date.now();
    await b.win.waitForFunction(
      () => /5002 clips|5000 clips/.test(document.querySelector("#ui-col-clips")?.innerText || ""),
      null,
      { timeout: 300000, polling: 200 },
    );
    log("seeded: bank list painted after", Date.now() - t1, "ms");
    const head = (await b.win.locator("#ui-col-clips").innerText()).split("\n").slice(0, 12);
    log("seeded: header lines", JSON.stringify(head));
    log("seeded: row count in DOM", await b.win.locator("#ui-col-clips ul li").count());
    log("seeded: filter chips", await b.win.locator('[aria-label="Filters"] button').count());
    log("seeded: OLD rows visible?", (await b.win.locator("#ui-col-clips").innerText()).includes("from an older version"));
    log("seeded: campaigns kept", JSON.stringify((await b.win.evaluate(() => {
      return [...document.querySelectorAll('[role="option"]')].map((o) => o.textContent);
    }))));
    await b.win.click("#ui-campaign-chip");
    log("seeded: campaign menu", JSON.stringify(await b.win.locator('[role="dialog"][aria-label="Campaign"]').innerText()));
    log("seeded: shot", await b.shot("seeded-5k"));
    const k0 = Date.now();
    await b.win.keyboard.press("Escape");
    await b.win.locator('#ui-col-clips input[aria-label="Search the bank"]').fill("S4999");
    await b.win.waitForFunction(
      () => /1 of 500\d clips/.test(document.querySelector("#ui-col-clips")?.innerText || ""),
      null,
      { timeout: 300000, polling: 100 },
    );
    log("seeded: search latency", Date.now() - k0, "ms");
    log("seeded: shot search", await b.shot("seeded-search"));
    log("seeded: state keys", Object.keys(b.readState()).join(","));
    log("seeded: ghost campaign still in bank?", JSON.stringify(Object.keys(b.readState()["clipper.bank"] || {})));
    log("pageErrors", JSON.stringify(b.logs.pageErrors).slice(0, 800));
  } catch (e) {
    console.error("FAIL part2", e);
    log("shot fail:", await b.shot("fail-part2"));
    log("pageErrors", JSON.stringify(b.logs.pageErrors).slice(0, 800));
  } finally {
    await b.close();
  }
})();
