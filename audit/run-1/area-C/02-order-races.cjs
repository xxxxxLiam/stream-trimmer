/**
 * File: 02-order-races.cjs
 * Path: audit/run-1/area-C/02-order-races.cjs
 * Description: Area C: order of actions, repetition and races around the bulk import.
 *   Audit-only; drives the real app.
 */
const { boot, campaign, loadVideo, openBankTab, importBlock, bankOf, VID } = require("./lib.cjs");

const log = (...x) => console.log("[C02]", ...x);

async function setText(a, v) {
  const ta = a.win.locator('textarea[placeholder="Paste your timestamps here"]');
  await ta.waitFor({ timeout: 15000 });
  const t0 = Date.now();
  await ta.evaluate((el, val) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, val);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, v);
  return Date.now() - t0;
}

const colText = (a) => a.win.locator("#ui-col-clips").innerText();

(async () => {
  const a = await boot("C02-order", {
    "clipper.campaigns": [campaign("acme", "Acme Q4"), campaign("beta", "Beta Launch")],
    "clipper.activeCampaign": "acme",
  });
  try {
    // ---- A. import before a video is loaded
    await openBankTab(a);
    log("A. no video yet, bank tab says:", JSON.stringify((await colText(a)).trim()));
    log("A. shot:", await a.shot("A-no-video"));

    await loadVideo(a);
    await openBankTab(a);

    // ---- B. import the same block twice
    const block = "A01 1:00-1:30 hook\nA02 2:00-2:40 payoff\n3:00-3:30 no id here";
    log("B. first:", await importBlock(a, block));
    log("B. rows after first:", bankOf(a, "acme").map((c) => c.id).join(","));
    log("B. second:", await importBlock(a, block));
    const after2 = bankOf(a, "acme");
    log("B. rows after second:", after2.map((c) => c.id).join(","), "count=", after2.length);
    log("B. on screen:", (await colText(a)).split("\n").slice(0, 8).join(" | "));
    log("B. shot:", await a.shot("B-twice"));

    // ---- C. duplicate ranges inside one paste (preview count vs stored count)
    const dupBlock = "9:00-9:30 take one\n9:00-9:30 take two";
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    await setText(a, dupBlock);
    await a.win.waitForTimeout(150);
    const promised = await a.win.locator('#ui-col-clips button:has-text("Import ")').first().innerText();
    await a.win.locator('#ui-col-clips button:has-text("Import ")').first().click();
    const dupRows = bankOf(a, "acme").filter((c) => c.segments[0].start === 540);
    log("C. button promised:", JSON.stringify(promised), "-> stored rows with that range:", dupRows.length,
        "labels:", JSON.stringify(dupRows.map((c) => c.label)));
    log("C. summary line:", (await colText(a)).split("\n").find((l) => l.startsWith("Imported:")));
    log("C. shot:", await a.shot("C-duplicate-ranges"));

    // ---- D. double-click the Import button
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    await setText(a, "D01 11:00-11:30\nD02 12:00-12:30");
    await a.win.waitForTimeout(150);
    const btn = a.win.locator('#ui-col-clips button:has-text("Import ")').first();
    await btn.dblclick({ delay: 5 }).catch((e) => log("D. dblclick threw:", e.message.split("\n")[0]));
    await a.win.waitForTimeout(400);
    const dRows = bankOf(a, "acme").filter((c) => c.id.startsWith("D0"));
    log("D. rows named D0x after double-click:", dRows.length, JSON.stringify(dRows.map((c) => c.id)));
    log("D. shot:", await a.shot("D-doubleclick"));

    // ---- E. switch campaign in the middle of a paste (nothing confirmed yet)
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    const bigPaste = Array.from({ length: 40 }, (_, i) => `E${i} ${20 + i}:00-${20 + i}:30 line ${i}`).join("\n");
    await setText(a, bigPaste);
    await a.win.waitForTimeout(200);
    log("E. before switch, importer shows:", (await colText(a)).split("\n").slice(0, 4).join(" | "));
    log("E. shot before:", await a.shot("E-mid-import"));
    await a.win.click("#ui-campaign-chip");
    await a.win.click('[role="option"]:has-text("Beta Launch")');
    await a.win.waitForTimeout(400);
    log("E. after switch to Beta, clips column:", JSON.stringify((await colText(a)).trim().slice(0, 300)));
    log("E. shot after:", await a.shot("E-after-switch"));
    // switch back: is the paste still there?
    await a.win.click("#ui-campaign-chip");
    await a.win.click('[role="option"]:has-text("Acme Q4")');
    await a.win.waitForTimeout(400);
    const taCount = await a.win.locator('textarea[placeholder="Paste your timestamps here"]').count();
    log("E. back on Acme: import box still open?", taCount > 0 ? "yes" : "no (paste discarded)");
    log("E. shot back:", await a.shot("E-back-on-acme"));

    log("final acme ids:", bankOf(a, "acme").map((c) => c.id).join(","));
    log("final beta ids:", bankOf(a, "beta").map((c) => c.id).join(","));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors));
  } catch (e) {
    console.error("FAIL", e);
    log("shot fail:", await a.shot("fail"));
  } finally {
    await a.close();
  }
})();
