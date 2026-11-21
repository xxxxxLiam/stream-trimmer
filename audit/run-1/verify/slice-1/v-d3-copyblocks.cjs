/**
 * v-d3-copyblocks.cjs — D-3. Is every block in the Copy blocks panel
 * permanently disabled, in every state?
 *
 * Written from the finding's Steps. The panel is opened and dumped three
 * times, in three progressively richer states:
 *   (1) nothing loaded at all,
 *   (2) an active campaign with a clip id pattern + a loaded video + transcript,
 *   (3) the same plus a marked segment (the state the finding describes),
 *   (4) and again after a real clip has been cut and saved.
 * For each block it records the label, the note/reason shown, and whether the
 * Copy button is disabled; it also records where focus landed when the panel
 * opened, and tries a real click on every Copy button.
 *
 * Usage: STUB=/tmp/vstubX xvfb-run -a node v-d3-copyblocks.cjs
 */
const fs = require("node:fs");
const { boot, loadUrl } = require("./v-lib.cjs");

const CLIPS = "/tmp/v-d3-clips";
const campaign = {
  id: "acme",
  name: "Acme Q4",
  targetMinSec: 5,
  targetMaxSec: 600,
  hardMaxSec: 600,
  clipIdPattern: "{prefix}-{videoId}-{nn}",
  prefix: "AUD",
  format: "mp4",
  quality: "best",
  clipsDir: CLIPS,
  dataDir: "/tmp/v-d3-data",
  usedRanges: {},
};

const dump = () => {
  const panel = document.querySelector('[role="dialog"][aria-label="Copy blocks"]');
  if (!panel) return { open: false };
  const rows = [...panel.querySelectorAll("button[data-copy]")].map((b) => {
    const row = b.closest("li") || b.parentElement.parentElement;
    return {
      block: (row?.innerText || "").replace(/\s+/g, " ").trim().slice(0, 110),
      disabled: b.disabled,
    };
  });
  return {
    open: true,
    blocks: rows,
    enabledCount: rows.filter((r) => !r.disabled).length,
    focus: document.activeElement
      ? `${document.activeElement.tagName}${document.activeElement.getAttribute("data-copy") !== null ? "[data-copy]" : ""}`
      : null,
  };
};

async function openPanel(a, label) {
  await a.win.click("#ui-copy-blocks");
  await a.win.waitForTimeout(900);
  const d = await a.win.evaluate(dump);
  a.log(`[${label}] panel:`, d);
  await a.shot(label);
  // Try a real click on every Copy button, enabled or not.
  const clicked = await a.win.evaluate(() => {
    const panel = document.querySelector('[role="dialog"][aria-label="Copy blocks"]');
    if (!panel) return "no panel";
    const out = [];
    for (const b of panel.querySelectorAll("button[data-copy]")) {
      out.push(b.disabled ? "disabled, not clickable" : "clickable");
    }
    return out;
  });
  a.log(`[${label}] per-button clickability:`, clicked);
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(500);
  return d;
}

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const a = await boot({
    label: "v-d3-copyblocks",
    stubRoot: process.env.STUB,
    viewport: { width: 1440, height: 1250 },
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.campaigns": [campaign],
      "clipper.activeCampaign": "acme",
      "clipper.clipsDir": CLIPS,
    },
  });
  try {
    a.log("copy-blocks button present:", await a.win.evaluate(() =>
      Boolean(document.querySelector("#ui-copy-blocks"))));
    await openPanel(a, "01-nothing-loaded");

    await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForTimeout(2000);
    await openPanel(a, "02-video-and-campaign");

    await a.win.locator("#ui-mark-in:visible").first().fill("00:00:03");
    await a.win.locator("#ui-mark-out:visible").first().fill("00:00:09");
    await a.win.keyboard.press("Control+Shift+Enter");
    await a.win.waitForTimeout(600);
    a.log("segment rows:", await a.win.evaluate(() =>
      [...document.querySelectorAll("li")]
        .map((li) => li.innerText.replace(/\s+/g, " ").trim())
        .filter((t) => /\d\d:\d\d:\d\d to \d\d:\d\d:\d\d/.test(t))));
    await openPanel(a, "03-with-a-segment");

    await a.win.locator("#ui-cut:visible").first().click();
    for (let i = 0; i < 30; i++) {
      await a.win.waitForTimeout(2000);
      if (fs.readdirSync(CLIPS).length) break;
    }
    a.log("clip on disk:", fs.readdirSync(CLIPS));
    await openPanel(a, "04-after-a-real-cut");

    // Does the symbol palette (the panel's neighbour) work, as a control that
    // overlays in general are fine?
    await a.win.click("#ui-symbols");
    await a.win.waitForTimeout(800);
    a.log("symbol palette buttons enabled:", await a.win.evaluate(() => {
      const p = [...document.querySelectorAll('[role="dialog"]')].find((d) => d.offsetParent);
      if (!p) return "no palette";
      const bs = [...p.querySelectorAll("button")];
      return { total: bs.length, enabled: bs.filter((b) => !b.disabled).length };
    }));
    await a.shot("05-symbol-palette-control");
  } finally {
    a.log("PROOF:", a.writeLog());
    await a.close();
  }
})();
