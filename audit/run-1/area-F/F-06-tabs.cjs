/**
 * F-06: the help button and drawer across workspace tabs.
 * The shell renders one AppHeader per tab, so ask: how many #ui-help-button
 * elements exist, which one does getElementById resolve to (the spotlight uses
 * getElementById), and is the help state per-tab?
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const probe = () => {
  const all = [...document.querySelectorAll('[id="ui-help-button"]')];
  const byId = document.getElementById("ui-help-button");
  const vis = (e) => {
    const r = e.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  return {
    helpButtons: all.length,
    helpButtonsVisible: all.filter(vis).length,
    getElementByIdVisible: byId ? vis(byId) : null,
    getElementByIdIsFirst: byId === all[0],
    headers: document.querySelectorAll("header").length,
    drawers: document.querySelectorAll('[id="ui-help-drawer"]').length,
    anchorDupes: Object.fromEntries(
      ["ui-campaign-chip", "ui-footer-clips", "ui-footer-data", "ui-copy-blocks", "ui-symbols", "ui-source-chip"].map((id) => {
        const list = [...document.querySelectorAll(`[id="${id}"]`)];
        const first = document.getElementById(id);
        return [id, { count: list.length, firstVisible: first ? vis(first) : null, visibleCount: list.filter(vis).length }];
      }),
    ),
  };
};

(async () => {
  const a = await L.boot("F-06-tabs");
  const rows = [];
  const snap = async (label) => {
    const s = await a.win.evaluate(probe);
    rows.push({ label, ...s });
    console.log(`\n== ${label}`);
    console.log(JSON.stringify(s, null, 1));
    return s;
  };
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await snap("one tab");

    await a.win.click('button[aria-label="New tab"]');
    await a.win.waitForTimeout(1500);
    await snap("two tabs (second active)");
    console.log("SHOT", await a.shot("two-tabs"));

    // Open help on the second tab, then switch to the first.
    await a.win.evaluate(() => {
      const btns = [...document.querySelectorAll('[id="ui-help-button"]')];
      const vis = btns.find((b) => b.getBoundingClientRect().width > 0);
      vis?.click();
    });
    await a.win.waitForTimeout(500);
    const drawerOnTab2 = await a.win.evaluate(() => document.querySelectorAll('[id="ui-help-drawer"]').length);
    console.log("drawers after opening help on tab 2:", drawerOnTab2);
    rows.push({ label: "help open on tab 2", drawers: drawerOnTab2 });
    console.log("SHOT", await a.shot("help-open-tab2"));

    await a.win.evaluate(() => document.querySelectorAll('[role="tab"]')[0].click());
    await a.win.waitForTimeout(1000);
    const s = await snap("switched to tab 1");
    console.log("SHOT", await a.shot("switched-to-tab1"));

    // The spotlight resolves anchors with getElementById. With two tabs
    // mounted, does it resolve to the HIDDEN tab's copy?
    await a.win.evaluate(() => {
      const btns = [...document.querySelectorAll('[id="ui-help-button"]')];
      const vis = btns.find((b) => b.getBoundingClientRect().width > 0);
      vis?.click();
    });
    await a.win.waitForTimeout(500);
    await a.win.evaluate(() => {
      const d = [...document.querySelectorAll('[id="ui-help-drawer"]')].find((x) => x.getBoundingClientRect().width > 0);
      [...d.querySelectorAll("[data-help-result]")].find((n) => n.textContent.startsWith("Switch campaign"))?.click();
    });
    await a.win.waitForTimeout(600);
    const spot = await a.win.evaluate(() => {
      const sp = document.querySelector("[data-help-spotlight]");
      const ring = sp?.firstElementChild;
      const r = ring?.getBoundingClientRect();
      const chips = [...document.querySelectorAll('[id="ui-campaign-chip"]')].map((e) => {
        const b = e.getBoundingClientRect();
        return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
      });
      return {
        spotlightFor: sp?.getAttribute("data-help-spotlight") ?? null,
        ring: r ? { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) } : null,
        campaignChips: chips,
        noticeShown: /not on screen right now/i.test(
          [...document.querySelectorAll('[id="ui-help-drawer"]')].map((d) => d.textContent).join(""),
        ),
      };
    });
    console.log("SPOTLIGHT WITH TWO TABS:", JSON.stringify(spot, null, 1));
    rows.push({ label: "spotlight with two tabs", ...spot });
    console.log("SHOT", await a.shot("spotlight-two-tabs"));
    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    const out = path.join(a.outDir, "tabs.json");
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
