/**
 * File: v5-c.cjs
 * Path: audit/run-1/verify/slice-5/v5-c.cjs
 * Description: Verifies C-2, C-5, C-6 and C-7, each driven from its own
 *   finding's Steps with a cold start per attempt.
 *
 *   C-6 and C-7 are performance claims, so they are measured with real
 *   keystrokes and real wall-clock time, with a double requestAnimationFrame
 *   after each key so the number includes React's commit and the paint, not
 *   just the event dispatch. A 200-row control bank is measured the same way in
 *   the same process, so the 5,000-row figures can be read against something.
 *
 *   Audit-only; changes no product code.
 */
const { boot, loadVideo, campaign, log } = require("./v5-lib.cjs");

const VID = "stub0000001";

// ------------------------------------------------------------------ helpers
async function openCampaignPopover(a) {
  await a.win.click("#ui-campaign-chip");
  await a.win.waitForTimeout(350);
}

async function createCampaign(a, name) {
  await openCampaignPopover(a);
  await a.win.click('button:has-text("New campaign")');
  await a.win.waitForTimeout(300);
  const nameField = a.win.locator('form input.field').first();
  await nameField.fill(name);
  await a.win.click('form button[type="submit"]');
  await a.win.waitForTimeout(600);
}

async function importBlock(a, text) {
  await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
  const ta = a.win.locator('textarea[placeholder="Paste your timestamps here"]');
  await ta.waitFor({ timeout: 15000 });
  await ta.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  const btn = a.win.locator('#ui-col-clips button:has-text("Import ")').first();
  await btn.waitFor({ timeout: 30000 });
  await btn.click();
  await a.win.waitForTimeout(800);
}

// ------------------------------------------------------------------ C-2
async function c2(run) {
  const a = await boot(`c2-${run}`);
  const out = { run };
  await createCampaign(a, "Acme Q4");
  await loadVideo(a);
  await a.win.click("#clips-tab-bank");
  await importBlock(
    a,
    "A01 1:00-1:30 acme hook | hook | T1\nA02 2:00-2:40 acme payoff | payoff | T2",
  );
  out.bankBeforeDelete = JSON.stringify(a.readState()["clipper.bank"] || {});
  out.rowsBeforeDelete = await a.win.evaluate(
    () => document.querySelectorAll('#clips-panel [role="button"]').length,
  );
  await a.shot("c2-01-banked");

  // Remove the campaign (two clicks: Remove, then Confirm).
  await openCampaignPopover(a);
  await a.win.click('button[aria-label="Remove Acme Q4"]');
  await a.win.waitForTimeout(250);
  await a.win.click('button[aria-label="Remove Acme Q4"]');
  await a.win.waitForTimeout(900);
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(400);
  const st = a.readState();
  out.campaignsAfterDelete = JSON.stringify(st["clipper.campaigns"] || []);
  out.bankAfterDelete = JSON.stringify(st["clipper.bank"] || {});
  out.bankRowsStillOnDisk = (() => {
    const b = st["clipper.bank"] || {};
    return Object.fromEntries(
      Object.entries(b).map(([cid, byVid]) => [cid, Object.fromEntries(Object.entries(byVid).map(([v, rows]) => [v, rows.length]))]),
    );
  })();
  await a.shot("c2-02-after-delete");

  // Recreate with the same name.
  await createCampaign(a, "Acme Q4");
  await a.win.waitForTimeout(600);
  const st2 = a.readState();
  out.campaignsAfterRecreate = JSON.stringify(st2["clipper.campaigns"] || []);
  await a.win.click("#clips-tab-bank").catch(() => {});
  await a.win.waitForTimeout(800);
  out.bankViewAfterRecreate = await a.win.evaluate(() => {
    const panel = document.querySelector("#clips-panel");
    if (!panel) return { missing: true };
    return {
      rowCount: panel.querySelectorAll('[role="button"]').length,
      text: panel.innerText.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 16),
    };
  });
  await a.shot("c2-03-recreated");
  await a.close();
  return out;
}

// ------------------------------------------------------------------ C-5
async function c5(run) {
  const a = await boot(`c5-${run}`, {
    seed: { "clipper.campaigns": [campaign("acme", "Acme Q4")], "clipper.activeCampaign": "acme" },
  });
  const out = { run };
  await createCampaign(a, "Beta Launch");
  out.before = JSON.stringify(
    (a.readState()["clipper.campaigns"] || []).map((c) => [c.id, c.name]),
  );
  // Edit Beta Launch -> rename to Acme Q4 -> Save
  await openCampaignPopover(a);
  await a.win.click('button[aria-label="Edit Beta Launch"]');
  await a.win.waitForTimeout(350);
  const nameField = a.win.locator("form input.field").first();
  await nameField.fill("Acme Q4");
  await a.win.click('form button[type="submit"]');
  await a.win.waitForTimeout(800);
  out.after = JSON.stringify(
    (a.readState()["clipper.campaigns"] || []).map((c) => [c.id, c.name]),
  );
  out.validationShown = await a.win.evaluate(() => {
    const al = document.querySelector('[role="alert"]');
    return al ? al.innerText.trim() : null;
  });
  await openCampaignPopover(a).catch(() => {});
  out.popoverRows = await a.win.evaluate(() => {
    const ul = document.querySelector('[role="listbox"][aria-label="Campaigns"]');
    return ul ? [...ul.querySelectorAll("li")].map((li) => li.innerText.replace(/\n/g, " | ")) : null;
  });
  out.headerChip = await a.win.evaluate(
    () => (document.querySelector("#ui-campaign-chip") || {}).innerText,
  );
  await a.shot("c5-duplicate-names");
  await a.close();
  return out;
}

// ------------------------------------------------------------------ C-6
function seedBank(n) {
  const rows = [];
  for (let i = 0; i < n; i++) {
    const start = i * 2;
    rows.push({
      id: `R${String(i).padStart(4, "0")}`,
      label: `line ${i}`,
      segments: [{ start, end: start + 1 }],
      status: "banked",
      category: `cat${i % 7}`,
      tier: String((i % 3) + 1),
    });
  }
  return rows;
}

/** One keystroke, timed from before the key to after the paint that follows. */
async function typeOneKey(a, ch) {
  const t0 = Date.now();
  await a.win.keyboard.press(ch);
  await a.win.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
  return Date.now() - t0;
}

async function c6(run, size) {
  const a = await boot(`c6-${size}-${run}`, {
    seed: {
      "clipper.campaigns": [campaign("acme", "Acme Q4")],
      "clipper.activeCampaign": "acme",
      "clipper.bank": { acme: { [VID]: seedBank(size) } },
    },
  });
  const out = { run, size };
  await loadVideo(a);
  const tOpen0 = Date.now();
  await a.win.click("#clips-tab-bank");
  await a.win.waitForSelector('input[aria-label="Search the bank"]', { timeout: 60000 });
  await a.win.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
  out.openBankMs = Date.now() - tOpen0;
  out.rowsInDom = await a.win.evaluate(
    () => document.querySelectorAll("#clips-panel li, #clips-panel [role='button']").length,
  );
  out.countLine = await a.win.evaluate(() => {
    const t = (document.querySelector("#clips-panel") || { innerText: "" }).innerText;
    return (t.split("\n").find((l) => /clips?$/.test(l.trim())) || "").trim();
  });
  out.filterChips = await a.win.evaluate(() => {
    const g = document.querySelector('[role="group"][aria-label="Filters"]');
    return g ? g.querySelectorAll("button").length : null;
  });

  // "line " — every prefix of which matches all rows — then "4999", which narrows.
  await a.win.click('input[aria-label="Search the bank"]');
  const keys = ["l", "i", "n", "e", "Space", "4", "9", "9", "9"];
  out.keystrokeMs = [];
  for (const k of keys) {
    out.keystrokeMs.push(await typeOneKey(a, k));
  }
  out.rowsAfterSearch = await a.win.evaluate(
    () => document.querySelectorAll("#clips-panel li, #clips-panel [role='button']").length,
  );
  await a.shot(`c6-${size}-after-typing`);

  // The committed-import cost the finding also claims.
  out.pageErrors = a.logs.pageErrors.slice(0, 2);
  await a.close();
  return out;
}

/** The 5,000-line import commit, timed. */
async function c6import(run) {
  const a = await boot(`c6-import-${run}`, {
    seed: { "clipper.campaigns": [campaign("acme", "Acme Q4")], "clipper.activeCampaign": "acme" },
  });
  await loadVideo(a);
  await a.win.click("#clips-tab-bank");
  const lines = [];
  for (let i = 0; i < 5000; i++) {
    const s = i * 2;
    const mm = String(Math.floor(s / 60)).padStart(2, "0");
    const ss = String(s % 60).padStart(2, "0");
    const e = s + 1;
    const mm2 = String(Math.floor(e / 60)).padStart(2, "0");
    const ss2 = String(e % 60).padStart(2, "0");
    lines.push(`R${String(i).padStart(4, "0")} ${mm}:${ss}-${mm2}:${ss2} line ${i}`);
  }
  await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
  const ta = a.win.locator('textarea[placeholder="Paste your timestamps here"]');
  await ta.waitFor({ timeout: 15000 });
  const tPaste = Date.now();
  await ta.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, lines.join("\n"));
  const btn = a.win.locator('#ui-col-clips button:has-text("Import ")').first();
  await btn.waitFor({ timeout: 180000 });
  const previewMs = Date.now() - tPaste;
  const t0 = Date.now();
  await btn.click();
  await a.win.waitForFunction(
    () => !document.querySelector('textarea[placeholder="Paste your timestamps here"]'),
    null,
    { timeout: 180000 },
  );
  await a.win.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
  const commitMs = Date.now() - t0;
  const rows = ((a.readState()["clipper.bank"] || {}).acme || {})[VID] || [];
  await a.close();
  return { previewMs, commitMs, rowsStored: rows.length };
}

// ------------------------------------------------------------------ C-7
async function c7(run) {
  const a = await boot(`c7-${run}`, {
    seed: { "clipper.campaigns": [campaign("acme", "Acme Q4")], "clipper.activeCampaign": "acme" },
  });
  const out = { run };
  await loadVideo(a);
  await a.win.click("#clips-tab-bank");
  await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
  const ta = a.win.locator('textarea[placeholder="Paste your timestamps here"]');
  await ta.waitFor({ timeout: 15000 });

  // 5 MB of prose with no timestamps anywhere in it.
  const line =
    "the quick brown fox jumps over the lazy dog and keeps on running through the field";
  const perLine = line.length + 1;
  const lineCount = Math.ceil((5 * 1024 * 1024) / perLine);
  const text = Array.from({ length: lineCount }, (_, i) => `${line} ${i}`).join("\n");
  out.bytes = Buffer.byteLength(text);
  out.lines = lineCount;

  const t0 = Date.now();
  await ta.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  // The preview section is what the finding times: wait for the "lines not
  // understood" alert to be painted.
  await a.win.waitForSelector('#ui-col-clips [role="alert"]', { timeout: 300000 });
  await a.win.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null)))),
  );
  out.previewMs = Date.now() - t0;
  out.errorLiCount = await a.win.evaluate(
    () => document.querySelectorAll('#ui-col-clips [role="alert"] li').length,
  );
  out.alertHeadline = await a.win.evaluate(() => {
    const al = document.querySelector('#ui-col-clips [role="alert"] p');
    return al ? al.innerText.trim() : null;
  });
  out.importButtonLabel = await a.win.evaluate(() => {
    const b = [...document.querySelectorAll("#ui-col-clips button")].find((x) =>
      /Nothing to import|Import \d/.test(x.innerText),
    );
    return b ? b.innerText.trim() : null;
  });
  await a.shot("c7-5mb-preview");

  // Is the window frozen while this happens? Measure responsiveness after.
  const tCancel = Date.now();
  const cancel = a.win.locator('#ui-col-clips button:has-text("Cancel")').first();
  if (await cancel.count()) {
    await cancel.click();
    await a.win
      .waitForFunction(
        () => !document.querySelector('textarea[placeholder="Paste your timestamps here"]'),
        null,
        { timeout: 300000 },
      )
      .catch(() => {});
  }
  out.cancelMs = Date.now() - tCancel;
  out.pageErrors = a.logs.pageErrors.slice(0, 2);
  await a.close();
  return out;
}

// ------------------------------------------------------------------ main
(async () => {
  const which = process.argv[2] || "all";
  for (const run of [1, 2]) {
    if (which === "all" || which === "c2") {
      const o = await c2(run);
      log(`\n=== C-2 run ${run} ===`);
      log("bank before delete:", o.bankBeforeDelete.slice(0, 300));
      log("rows shown before delete:", o.rowsBeforeDelete);
      log("campaigns after delete:", o.campaignsAfterDelete);
      log("bank row counts still on disk after delete:", JSON.stringify(o.bankRowsStillOnDisk));
      log("bank after delete:", o.bankAfterDelete.slice(0, 400));
      log("campaigns after recreating 'Acme Q4':", o.campaignsAfterRecreate.slice(0, 300));
      log("bank view after recreate:", JSON.stringify(o.bankViewAfterRecreate));
    }
    if (which === "all" || which === "c5") {
      const o = await c5(run);
      log(`\n=== C-5 run ${run} ===`);
      log("before rename:", o.before);
      log("after  rename:", o.after);
      log("validation alert shown:", JSON.stringify(o.validationShown));
      log("popover rows:", JSON.stringify(o.popoverRows));
      log("header chip:", JSON.stringify(o.headerChip));
    }
    if (which === "all" || which === "c6") {
      for (const size of [200, 5000]) {
        const o = await c6(run, size);
        log(`\n=== C-6 run ${run}, ${size}-row bank ===`);
        log("open Bank tab:", o.openBankMs, "ms");
        log("rows in DOM:", o.rowsInDom, " count line:", JSON.stringify(o.countLine), " filter chips:", o.filterChips);
        log("per-keystroke ms (l,i,n,e,space,4,9,9,9):", JSON.stringify(o.keystrokeMs));
        log("rows after search:", o.rowsAfterSearch);
        log("pageErrors:", JSON.stringify(o.pageErrors));
      }
      const imp = await c6import(run);
      log(`\n=== C-6 run ${run}, 5,000-line import ===`);
      log(JSON.stringify(imp));
    }
    if (which === "all" || which === "c7") {
      const o = await c7(run);
      log(`\n=== C-7 run ${run} ===`);
      log(`pasted ${o.bytes} bytes / ${o.lines} lines`);
      log("preview painted after:", o.previewMs, "ms");
      log("error <li> in the DOM:", o.errorLiCount);
      log("alert headline:", JSON.stringify(o.alertHeadline));
      log("import button:", JSON.stringify(o.importButtonLabel));
      log("cancel took:", o.cancelMs, "ms");
      log("pageErrors:", JSON.stringify(o.pageErrors));
    }
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
