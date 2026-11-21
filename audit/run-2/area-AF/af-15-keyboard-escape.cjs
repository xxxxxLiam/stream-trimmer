#!/usr/bin/env node
/**
 * AF-15 — the escape route from the keyboard alone, and where focus lands on a
 * clean dismiss (no pointer interaction at all).
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, AUTH_TEXT } = require("./lib.cjs");

const R = {};
const FOCUS = `(() => {
  const a = document.activeElement;
  const r = a?.getBoundingClientRect?.();
  return { tag: a?.tagName, id: a?.id || null, text: (a?.textContent||"").trim().slice(0,40),
           isBody: a === document.body, w: r ? Math.round(r.width) : null };
})()`;

async function run(label, how) {
  writeStub({ auth: { ...AUTH_TEXT.profile_missing }, subs: {}, infoStage: {}, downloadStage: {} });
  const a = await launch({ label, seed: { "clipper.dataDirConfirmed": true } });
  const out = {};
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await a.win.waitForTimeout(1800);
    out.focusOnOpen = await a.win.evaluate(FOCUS);
    if (how === "tab-enter") {
      await a.win.keyboard.press("Tab");
      out.firstTabStop = await a.win.evaluate(FOCUS);
      await a.win.keyboard.press("Enter");
    } else {
      await a.win.keyboard.press("Escape");
    }
    await a.win.waitForTimeout(600);
    out.dialogs = await a.win.locator('[role="dialog"]').count();
    out.focusAfter = await a.win.evaluate(FOCUS);
    out.inertLeft = await a.win.evaluate(() => document.querySelectorAll("[inert]").length);
    out.ariaHiddenOnShell = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[aria-hidden="true"]'))
        .filter((e) => e.children.length > 2).length,
    );
    // can the keyboard now reach the app?
    const stops = [];
    for (let i = 0; i < 6; i++) {
      await a.win.keyboard.press("Tab");
      stops.push(await a.win.evaluate(FOCUS));
    }
    out.tabsAfter = stops.map((s) => `${s.tag}#${s.id || ""}:${s.text}`);
    out.shot = await a.shot(`after-${how}`);
  } finally {
    a.save(`af-15-${label}.json`, out);
    await a.close();
  }
  return out;
}

async function main() {
  R.escape = await run("af-15-escape", "escape");
  R.tabEnter = await run("af-15-tabenter", "tab-enter");
  fs.writeFileSync(path.join(__dirname, "out", "af-15.json"), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
