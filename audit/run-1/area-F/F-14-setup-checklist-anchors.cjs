/**
 * F-14: the Setup checklist lives inside the help drawer and two of its
 * "do it for me" buttons drive the same dead anchor ids
 * (help-anchor-youtube-status, help-anchor-clips-tabs) with
 * document.getElementById(...)?.click(). Confirm they are no-ops.
 * Also: the wording when there is no log file at all.
 */
const fs = require("node:fs");
const path = require("node:path");
const L = require("./lib.cjs");

(async () => {
  const a = await L.boot("F-14-setup-checklist");
  const out = {};
  try {
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await L.openHelp(a.win);
    await a.win.click("#help-setup-toggle");
    await a.win.waitForTimeout(800);
    out.panel = await a.win.evaluate(() => {
      const p = document.getElementById("help-setup-panel");
      return {
        present: Boolean(p),
        buttons: p ? [...p.querySelectorAll("button")].map((b) => b.textContent.trim().slice(0, 50)) : [],
        text: p ? p.textContent.trim().slice(0, 400) : null,
      };
    });
    console.log("setup panel:", JSON.stringify(out.panel, null, 1));
    console.log("SHOT", await a.shot("setup-checklist"));

    out.deadAnchors = await a.win.evaluate(() => ({
      youtubeStatus: Boolean(document.getElementById("help-anchor-youtube-status")),
      clipsTabs: Boolean(document.getElementById("help-anchor-clips-tabs")),
      // the real ids those two controls carry
      realClipsTab: Boolean(document.getElementById("clips-tab-all")),
    }));
    console.log("dead anchors used by SetupChecklist:", JSON.stringify(out.deadAnchors));

    // Press each checklist action and see whether anything happened.
    const before = await a.win.evaluate(() => document.body.innerText.length);
    const pressed = [];
    const n = out.panel.buttons.length;
    for (let i = 0; i < n; i++) {
      const label = await a.win.evaluate((idx) => {
        const p = document.getElementById("help-setup-panel");
        const bs = [...p.querySelectorAll("button")];
        const b = bs[idx];
        if (!b) return null;
        const t = b.textContent.trim().slice(0, 40);
        b.click();
        return t;
      }, i);
      await a.win.waitForTimeout(600);
      const changed = await a.win.evaluate(() => ({
        len: document.body.innerText.length,
        dialog: Boolean(document.querySelector('[role="dialog"]')),
      }));
      pressed.push({ label, ...changed });
      console.log(`  pressed "${label}" -> bodyTextLen=${changed.len} dialog=${changed.dialog}`);
    }
    out.pressed = pressed;
    out.before = before;
    console.log("SHOT", await a.shot("after-checklist-actions"));
    console.log("PAGE ERRORS", JSON.stringify(a.logs.pageErrors));
  } finally {
    const f = path.join(a.outDir, "setup-checklist.json");
    fs.writeFileSync(f, JSON.stringify(out, null, 2));
    console.log("REPORT", f);
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
