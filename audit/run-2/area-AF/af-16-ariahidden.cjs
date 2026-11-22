#!/usr/bin/env node
/** AF-16 — does the trap really restore aria-hidden on the shell when the gate closes? */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, AUTH_TEXT } = require("./lib.cjs");

const DUMP = `(() => {
  const dlg = document.querySelector('[role="dialog"]');
  const shell = document.querySelector(".surface-ground");
  const kids = Array.from(shell?.children ?? []);
  return {
    dialogPresent: !!dlg,
    shellChildren: kids.map(k => ({
      cls: String(k.className).slice(0, 40),
      inert: k.hasAttribute("inert"),
      ariaHidden: k.getAttribute("aria-hidden"),
    })),
    allAriaHiddenBig: Array.from(document.querySelectorAll('[aria-hidden="true"]'))
      .filter(e => e.children.length > 2)
      .map(e => e.tagName + "." + String(e.className).slice(0, 40)),
  };
})()`;

async function main() {
  writeStub({ auth: { ...AUTH_TEXT.profile_missing }, subs: {}, infoStage: {}, downloadStage: {} });
  const a = await launch({ label: "af-16", seed: { "clipper.dataDirConfirmed": true } });
  const R = {};
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await a.win.waitForTimeout(1800);
    R.duringGate = await a.win.evaluate(DUMP);
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(800);
    R.afterEscape = await a.win.evaluate(DUMP);
    // and reopened through the chip, then dismissed again
    await a.win.click("#help-anchor-youtube-status");
    await a.win.waitForTimeout(300);
    await a.win.locator('[role="menu"] button', { hasText: "Sign in" }).first().click();
    await a.win.waitForTimeout(700);
    R.reopened = await a.win.evaluate(DUMP);
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(700);
    R.afterSecondEscape = await a.win.evaluate(DUMP);
  } finally {
    a.save("af-16.json", R);
    fs.writeFileSync(path.join(__dirname, "out", "af-16.json"), JSON.stringify(R, null, 2));
    await a.close();
  }
  console.log(JSON.stringify(R, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
