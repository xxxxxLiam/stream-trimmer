#!/usr/bin/env node
/**
 * AF-14 — the help drawer opened over the sign-in gate at a narrow window,
 * where the drawer is full width.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, AUTH_TEXT } = require("./lib.cjs");

const R = {};

async function main() {
  writeStub({ auth: { ...AUTH_TEXT.profile_missing }, subs: {}, infoStage: {}, downloadStage: {} });
  const a = await launch({ label: "af-14", seed: { "clipper.dataDirConfirmed": true } });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await a.win.setViewportSize({ width: 760, height: 800 });
    await a.win.waitForTimeout(1500);
    R.before = await a.shot("gate-760");
    await a.win.click("#ui-help-button");
    await a.win.waitForTimeout(800);
    R.state = await a.win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      const dr = d?.getBoundingClientRect();
      const btn = Array.from(document.querySelectorAll('[role="dialog"] button')).find((b) =>
        /Continue without signing in/.test(b.textContent || ""),
      );
      const r = btn?.getBoundingClientRect();
      const hit = r ? document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2) : null;
      return {
        drawer: dr ? { x: Math.round(dr.x), w: Math.round(dr.width), h: Math.round(dr.height) } : null,
        drawerInert: !!d?.closest("[inert]"),
        viewport: window.innerWidth,
        continueVisible: !!r && r.width > 0,
        continueHit: hit ? hit.tagName + "#" + (hit.id || "") : null,
        continueHitsItself: !!(btn && hit && (hit === btn || btn.contains(hit))),
        dialogCoveredPct: (() => {
          const dlg = document.querySelector('[role="dialog"] > div');
          if (!dlg || !dr) return null;
          const q = dlg.getBoundingClientRect();
          const ox = Math.max(0, Math.min(q.right, dr.right) - Math.max(q.left, dr.left));
          const oy = Math.max(0, Math.min(q.bottom, dr.bottom) - Math.max(q.top, dr.top));
          return Math.round((100 * ox * oy) / (q.width * q.height));
        })(),
      };
    });
    R.shot = await a.shot("drawer-over-gate-760");
    let click = "n/a";
    try {
      await a.win.locator('[role="dialog"] button', { hasText: "Continue without signing in" })
        .first().click({ timeout: 3000 });
      await a.win.waitForTimeout(500);
      click = (await a.win.locator('[role="dialog"]').count()) === 0 ? "escaped" : "still gated";
    } catch (e) { click = `BLOCKED: ${String(e).split("\n")[0]}`; }
    R.clickContinue = click;
    if (click !== "escaped") {
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(500);
      R.escapeWorked = (await a.win.locator('[role="dialog"]').count()) === 0;
      R.drawerUsableAfterEscape = await a.win.evaluate(() => {
        const d = document.getElementById("ui-help-drawer");
        return d ? !d.closest("[inert]") : null;
      });
      R.shotAfter = await a.shot("after-escape-760");
    }
  } finally {
    a.save("af-14.json", R);
    fs.writeFileSync(path.join(__dirname, "out", "af-14.json"), JSON.stringify(R, null, 2));
    await a.close();
  }
  console.log(JSON.stringify(R, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
