/**
 * File: 10-interrupt.cjs
 * Path: audit/run-1/area-C/10-interrupt.cjs
 * Description: Area C: SIGKILL the app in the middle of a large import, then relaunch from
 *   the exact state it left on disk and see whether the bank is consistent or half-written.
 *   Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, campaign, loadVideo, openBankTab, VID } = require("./lib.cjs");

const log = (...x) => console.log("[C10]", ...x);
const TA = 'textarea[placeholder="Paste your timestamps here"]';
const KILL_AFTER_MS = Number(process.argv[2] || 900);

(async () => {
  const a = await boot("C10-kill", {
    "clipper.campaigns": [campaign("acme", "Acme Q4")],
    "clipper.activeCampaign": "acme",
  });
  const settingsPath = path.join(a.userDataDir, "settings.json");
  let state = null;
  try {
    await loadVideo(a);
    await openBankTab(a);
    const lines = Array.from({ length: 5000 }, (_, i) => `${(i * 0.7).toFixed(2)}-${(i * 0.7 + 0.5).toFixed(2)} line ${i}`).join("\n");
    await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
    await a.win.locator(TA).evaluate((el, val) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
      setter.call(el, val);
      el.dispatchEvent(new Event("input", { bubbles: true }));
    }, lines);
    await a.win.waitForFunction(() => /5000 clips/.test(document.body.innerText), null, { timeout: 120000, polling: 100 });

    const pid = a.app.process().pid;
    log("clicking Import 5000 clips, then SIGKILL after", KILL_AFTER_MS, "ms (pid", pid, ")");
    a.win.locator('#ui-col-clips button:has-text("Import 5000")').first().click().catch(() => {});
    await new Promise((r) => setTimeout(r, KILL_AFTER_MS));
    try {
      process.kill(pid, "SIGKILL");
    } catch (e) {
      log("kill failed:", String(e));
    }
    await new Promise((r) => setTimeout(r, 1500));

    const raw = fs.existsSync(settingsPath) ? fs.readFileSync(settingsPath, "utf8") : "";
    log("settings.json exists:", !!raw, "bytes:", raw.length);
    log("stray .tmp file left behind:", fs.existsSync(settingsPath + ".tmp"));
    try {
      state = JSON.parse(raw);
      log("settings.json parses: yes");
    } catch (e) {
      log("settings.json DOES NOT PARSE:", String(e).split("\n")[0]);
      log("tail:", JSON.stringify(raw.slice(-200)));
    }
    if (state) {
      const rows = state["clipper.bank"]?.acme?.[VID] ?? [];
      log("rows on disk after the kill:", rows.length);
      log("campaigns on disk:", JSON.stringify((state["clipper.campaigns"] || []).map((c) => c.id)));
    }
  } catch (e) {
    console.error("FAIL", e);
  } finally {
    try { await a.close(); } catch {}
  }

  if (!state) return;
  // ---- relaunch from exactly what the kill left on disk
  const b = await boot("C10-relaunch", state);
  try {
    await loadVideo(b);
    await openBankTab(b);
    await b.win.waitForTimeout(1500);
    const t = await b.win.locator("#ui-col-clips").innerText();
    log("after relaunch, count line:", JSON.stringify(t.split("\n").find((l) => /clips/.test(l))));
    log("after relaunch, rows in DOM:", await b.win.locator("#ui-col-clips ul li").count());
    log("after relaunch, rows on disk:", (b.readState()["clipper.bank"]?.acme?.[VID] ?? []).length);
    log("shot:", await b.shot("after-relaunch"));
    log("pageErrors:", JSON.stringify(b.logs.pageErrors).slice(0, 400));
  } catch (e) {
    console.error("FAIL relaunch", e);
  } finally {
    await b.close();
  }
})();
