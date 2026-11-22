/**
 * File: v5-c6b-scale.cjs
 * Path: audit/run-1/verify/slice-5/v5-c6b-scale.cjs
 * Description: C-6 follow-up. Two things the headline claim does not answer:
 *   (a) where the knee is — at what bank size does typing stop being usable,
 *       which decides whether this bites a real user or only a stress test;
 *   (b) the 5,000-row import COMMIT cost, measured with ranges that all fit
 *       inside the stub video's 1:00:00 so all 5,000 rows actually land (the
 *       first attempt lost 3,200 of them to the past-the-end-of-video check).
 *
 *   Audit-only; changes no product code.
 */
const { boot, loadVideo, campaign, log } = require("./v5-lib.cjs");

const VID = "stub0000001";

function seedBank(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const start = Number((i * 0.7).toFixed(3));
    rows.push({
      id: `R${String(i).padStart(4, "0")}`,
      label: `line ${i}`,
      segments: [{ start, end: Number((start + 0.5).toFixed(3)) }],
      status: "banked",
      category: `cat${i % 7}`,
      tier: String((i % 3) + 1),
    });
  }
  return rows;
}

async function key(a, ch) {
  const t0 = Date.now();
  await a.win.keyboard.press(ch);
  await a.win.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
  return Date.now() - t0;
}

async function latency(size, run) {
  const a = await boot(`c6b-${size}-${run}`, {
    seed: {
      "clipper.campaigns": [campaign("acme", "Acme Q4")],
      "clipper.activeCampaign": "acme",
      "clipper.bank": { acme: { [VID]: seedBank(size) } },
    },
  });
  await loadVideo(a);
  await a.win.click("#clips-tab-bank");
  await a.win.waitForSelector('input[aria-label="Search the bank"]');
  await a.win.click('input[aria-label="Search the bank"]');
  const ms = [];
  for (const ch of ["l", "i", "n", "e"]) ms.push(await key(a, ch));
  const rows = await a.win.evaluate(
    () => document.querySelectorAll("#clips-panel [role='button']").length,
  );
  await a.close();
  return { size, ms, rowsInDom: rows, worst: Math.max(...ms) };
}

function hms(t) {
  const h = Math.floor(t / 3600);
  const m = Math.floor((t % 3600) / 60);
  const s = (t % 60).toFixed(3).padStart(6, "0");
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${s}`;
}

async function importCommit(run) {
  const a = await boot(`c6b-import-${run}`, {
    seed: { "clipper.campaigns": [campaign("acme", "Acme Q4")], "clipper.activeCampaign": "acme" },
  });
  await loadVideo(a);
  await a.win.click("#clips-tab-bank");
  const lines = [];
  for (let i = 0; i < 5000; i++) {
    const s = i * 0.7;
    lines.push(`R${String(i).padStart(4, "0")} ${hms(s)}-${hms(s + 0.5)} line ${i}`);
  }
  await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
  const ta = a.win.locator('textarea[placeholder="Paste your timestamps here"]');
  await ta.waitFor();
  const t0 = Date.now();
  await ta.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, lines.join("\n"));
  const btn = a.win.locator('#ui-col-clips button:has-text("Import ")').first();
  await btn.waitFor();
  const previewMs = Date.now() - t0;
  const label = (await btn.innerText()).trim();
  const t1 = Date.now();
  await btn.click();
  await a.win.waitForFunction(
    () => !document.querySelector('textarea[placeholder="Paste your timestamps here"]'),
  );
  await a.win.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
  const commitMs = Date.now() - t1;
  const rows = ((a.readState()["clipper.bank"] || {}).acme || {})[VID] || [];
  await a.close();
  return { previewMs, buttonLabel: label, commitMs, rowsStored: rows.length };
}

(async () => {
  for (const run of [1, 2]) {
    log(`\n=== C-6 follow-up, run ${run}: where the knee is ===`);
    for (const size of [100, 500, 1000, 2000, 5000]) {
      const r = await latency(size, run);
      log(`  ${String(size).padStart(5)} rows: keystrokes ${JSON.stringify(r.ms)} ms (worst ${r.worst}), rows in DOM ${r.rowsInDom}`);
    }
    log(`\n=== C-6 follow-up, run ${run}: 5,000-row import commit ===`);
    log("  " + JSON.stringify(await importCommit(run)));
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
