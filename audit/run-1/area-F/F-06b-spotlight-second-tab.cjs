/**
 * F-06b: with a second workspace tab ACTIVE, every ui-* anchor id exists twice
 * in the document. Spotlight resolves anchors with document.getElementById,
 * which returns the FIRST match - the hidden first tab's copy. Does the
 * tutorial then point at nothing / claim the control is not on screen?
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

(async () => {
  const a = await L.boot("F-06b-spotlight-second-tab");
  const rows = [];
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });

    // Tab 2, active.
    await a.win.click('button[aria-label="New tab"]');
    await a.win.waitForTimeout(1600);
    const active = await a.win.evaluate(() =>
      [...document.querySelectorAll('[role="tab"]')].map((t) => t.getAttribute("aria-selected")),
    );
    console.log("tab aria-selected:", JSON.stringify(active));

    // Open help on the visible (second) tab and run two tutorials whose first
    // step points at an anchor that IS on screen.
    await a.win.evaluate(() => {
      [...document.querySelectorAll('[id="ui-help-button"]')].find((b) => b.getBoundingClientRect().width > 0)?.click();
    });
    await a.win.waitForTimeout(600);

    for (const [title, anchor] of [
      ["Switch campaign", "ui-campaign-chip"],
      ["Change where clips save", "ui-footer-clips"],
      ["Copy a transcript for a chat", "ui-copy-blocks"],
      ["Insert a symbol or honorific", "ui-symbols"],
    ]) {
      await a.win.evaluate(() => {
        const d = [...document.querySelectorAll('[id="ui-help-drawer"]')].find((x) => x.getBoundingClientRect().width > 0);
        [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "All tasks")?.click();
      });
      await a.win.waitForTimeout(250);
      await a.win.evaluate((t) => {
        const d = [...document.querySelectorAll('[id="ui-help-drawer"]')].find((x) => x.getBoundingClientRect().width > 0);
        [...d.querySelectorAll("[data-help-result]")].find((n) => n.textContent.startsWith(t))?.click();
      }, title);
      await a.win.waitForTimeout(600);

      const r = await a.win.evaluate((id) => {
        const all = [...document.querySelectorAll(`[id="${id}"]`)];
        const first = document.getElementById(id);
        const vis = (e) => {
          const b = e.getBoundingClientRect();
          return b.width > 0 && b.height > 0;
        };
        const sp = document.querySelector("[data-help-spotlight]");
        return {
          anchor: id,
          copies: all.length,
          getElementByIdVisible: first ? vis(first) : null,
          visibleCopyExists: all.some(vis),
          spotlightRendered: Boolean(sp),
          spotlightFor: sp?.getAttribute("data-help-spotlight") ?? null,
          noticeShown: /not on screen right now/i.test(
            [...document.querySelectorAll('[id="ui-help-drawer"]')].map((d) => d.textContent).join(""),
          ),
        };
      }, anchor);
      rows.push({ title, ...r });
      console.log(
        `${title.padEnd(30)} anchor=${anchor} copies=${r.copies} firstVisible=${r.getElementByIdVisible} visibleCopyExists=${r.visibleCopyExists} spotlight=${r.spotlightRendered} notice=${r.noticeShown}`,
      );
      await a.shot(`tab2-${title.replace(/\W+/g, "-").toLowerCase()}`);
    }
    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    const out = path.join(a.outDir, "second-tab.json");
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
