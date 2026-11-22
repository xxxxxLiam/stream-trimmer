/**
 * F-02: proves the controls the tutorials name DO exist in the running app,
 * just not under the ids helpTasks.ts points at. Dumps every element id in the
 * workspace with a video loaded, with each overlay opened, and lists which
 * ANCHORS entries are matched.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

(async () => {
  const cat = L.readCatalogue();
  const a = await L.boot("F-02-dom-ids");
  const report = {};
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.locator("#ui-source-chip input").fill("https://www.youtube.com/watch?v=stub0000001");
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(6000);

    const ids = async () => a.win.evaluate(() => [...document.querySelectorAll("[id]")].map((e) => e.id).sort());

    report.workspaceIds = await ids();

    // Open each overlay in turn and collect ids again.
    for (const [name, sel] of [
      ["copyBlocks", "#ui-copy-blocks"],
      ["symbols", "#ui-symbols"],
      ["settings", "#ui-settings"],
    ]) {
      await a.win.click(sel);
      await a.win.waitForTimeout(600);
      report[`${name}Ids`] = await ids();
      await a.shot(`overlay-${name}`);
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(400);
    }

    const allIds = new Set([...report.workspaceIds, ...report.copyBlocksIds, ...report.symbolsIds, ...report.settingsIds]);
    report.anchorStatus = Object.fromEntries(
      Object.entries(cat.anchors).map(([k, v]) => [k, { id: v, presentSomewhere: allIds.has(v) }]),
    );

    // Buttons whose visible text matches what a step tells the user to press,
    // so the report can say what the id SHOULD have been put on.
    report.namedControls = await a.win.evaluate(() => {
      const wanted = [/cut as one file/i, /add segment/i, /^search/i, /mark in/i, /mark out/i, /all saved/i];
      return [...document.querySelectorAll("button,input,a,[role=tab]")]
        .filter((e) => wanted.some((w) => w.test((e.getAttribute("aria-label") || e.textContent || e.placeholder || "").trim())))
        .map((e) => ({
          tag: e.tagName.toLowerCase(),
          id: e.id || "(no id)",
          label: (e.getAttribute("aria-label") || e.textContent || e.placeholder || "").trim().slice(0, 50),
          cls: String(e.className).slice(0, 50),
        }));
    });

    const missing = Object.entries(report.anchorStatus).filter(([, v]) => !v.presentSomewhere);
    console.log(`ANCHORS defined: ${Object.keys(cat.anchors).length}; never present in DOM: ${missing.length}`);
    for (const [k, v] of missing) console.log("  MISSING", k, "=", v.id);
    console.log("\nControls the steps name, and the ids they actually carry:");
    for (const c of report.namedControls) console.log("  ", JSON.stringify(c));
    console.log("\nDuplicate ids in the live DOM:");
    const counts = {};
    for (const i of report.workspaceIds) counts[i] = (counts[i] || 0) + 1;
    console.log("  ", JSON.stringify(Object.entries(counts).filter(([, n]) => n > 1)));
  } finally {
    const out = path.join(a.outDir, "dom-ids.json");
    fs.writeFileSync(out, JSON.stringify(report, null, 2));
    console.log("REPORT", out);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
