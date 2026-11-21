/**
 * F-05b: (a) does "All tasks" clear the search query? (b) starting a second
 * tutorial while one runs, (c) the help drawer across workspace tabs.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

const state = () => {
  const d = document.getElementById("ui-help-drawer");
  if (!d) return { open: false };
  return {
    open: true,
    task: d.querySelector("h3")?.textContent.trim() ?? null,
    step: (d.textContent.match(/Step \d+ of \d+/) || [])[0] ?? null,
    listShown: d.querySelectorAll("[data-help-result]").length,
    query: document.getElementById("help-search")?.value ?? null,
    spotlights: document.querySelectorAll("[data-help-spotlight]").length,
  };
};

(async () => {
  const a = await L.boot("F-05b-tutorial-switch");
  const rows = [];
  const snap = async (label) => {
    const s = await a.win.evaluate(state);
    rows.push({ label, ...s });
    console.log(`${label.padEnd(46)} ${JSON.stringify(s)}`);
    return s;
  };
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await L.openHelp(a.win);

    // (a) search, pick, go back: is the query still filtering?
    await a.win.locator("#help-search").fill("folder");
    await a.win.waitForTimeout(250);
    await snap("a1. after searching 'folder'");
    await a.win.evaluate(() => {
      [...document.querySelectorAll("[data-help-result]")][0].click();
    });
    await a.win.waitForTimeout(300);
    await snap("a2. tutorial open");
    await a.win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "All tasks")?.click();
    });
    await a.win.waitForTimeout(300);
    await snap("a3. after 'All tasks' (query cleared?)");
    console.log("SHOT", await a.shot("all-tasks-keeps-query"));

    // (b) second tutorial while one runs
    await a.win.locator("#help-search").fill("");
    await a.win.waitForTimeout(250);
    await a.win.evaluate(() => {
      [...document.querySelectorAll("[data-help-result]")].find((n) => n.textContent.startsWith("Cut a clip")).click();
    });
    await a.win.waitForTimeout(300);
    await a.win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      [...d.querySelectorAll("button")].find((x) => x.textContent.trim() === "Next step")?.click();
    });
    await a.win.waitForTimeout(300);
    await snap("b1. 'Cut a clip' at step 2");
    // Typing in the search field while a tutorial runs: does it abandon it?
    await a.win.locator("#help-search").fill("symbol");
    await a.win.waitForTimeout(300);
    await snap("b2. typed in search during tutorial");
    await a.win.evaluate(() => {
      [...document.querySelectorAll("[data-help-result]")].find((n) => n.textContent.startsWith("Insert a symbol")).click();
    });
    await a.win.waitForTimeout(400);
    await snap("b3. second tutorial started");
    console.log("SHOT", await a.shot("second-tutorial-started"));

    // (c) tabs
    const tabCount = async () => a.win.evaluate(() => document.querySelectorAll('[role="tab"], button').length);
    await a.win.evaluate(() => {
      const plus = [...document.querySelectorAll("button")].find(
        (b) => (b.getAttribute("aria-label") || "").match(/new tab|add/i) || b.textContent.trim() === "+",
      );
      plus?.click();
    });
    await a.win.waitForTimeout(1500);
    await snap("c1. after opening a second workspace tab");
    const headerOnNewTab = await a.win.evaluate(() => ({
      helpButtons: document.querySelectorAll("#ui-help-button").length,
      headers: document.querySelectorAll("header").length,
    }));
    console.log("c1 header/help on new tab:", JSON.stringify(headerOnNewTab));
    rows.push({ label: "c1. duplicate shell elements", ...headerOnNewTab });
    console.log("SHOT", await a.shot("second-workspace-tab"));

    // Back to the first tab
    const tabs = await a.win.evaluate(() =>
      [...document.querySelectorAll("button")].map((b, i) => ({ i, t: b.textContent.trim().slice(0, 20) })).filter((x) => /New tab/.test(x.t)),
    );
    console.log("tab buttons:", JSON.stringify(tabs));
    await a.win.evaluate((idx) => {
      [...document.querySelectorAll("button")][idx].click();
    }, tabs[0].i);
    await a.win.waitForTimeout(1200);
    await snap("c2. back on the first tab");
    console.log("SHOT", await a.shot("back-on-first-tab"));
    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    const out = path.join(a.outDir, "tutorial-switch.json");
    fs.writeFileSync(out, JSON.stringify(rows, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
