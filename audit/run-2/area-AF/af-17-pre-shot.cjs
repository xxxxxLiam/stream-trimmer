#!/usr/bin/env node
/** AF-17 — a screenshot of the unredacted diagnostics panel, scrolled into view. */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, AUTH_TEXT } = require("./lib.cjs");
const { corpus, leaks } = require("./markers.cjs");

async function main() {
  writeStub({
    auth: { ...AUTH_TEXT.profile_missing, stderr: `${AUTH_TEXT.profile_missing.stderr}\n${corpus()}` },
    subs: {}, infoStage: {}, downloadStage: {},
  });
  const a = await launch({ label: "af-17", seed: { "clipper.dataDirConfirmed": true } });
  const R = {};
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await a.win.waitForTimeout(6000);
    await a.win.locator('[role="dialog"] button', { hasText: "Diagnostics" }).first().click();
    await a.win.waitForTimeout(1500);
    await a.win.evaluate(() => {
      const pre = document.querySelector('[role="dialog"] pre');
      pre?.scrollIntoView({ block: "center" });
    });
    await a.win.waitForTimeout(600);
    const pre = await a.win.evaluate(
      () => document.querySelector('[role="dialog"] pre')?.textContent || "",
    );
    R.preBytes = pre.length;
    R.preLeaks = leaks(pre);
    R.promise = await a.win.evaluate(() => {
      const p = Array.from(document.querySelectorAll('[role="dialog"] p')).find((e) =>
        /no cookies, tokens or personal data/.test(e.textContent || ""),
      );
      return p ? p.textContent.replace(/\s+/g, " ").trim() : null;
    });
    R.shot = await a.shot("diagnostics-pre-unredacted");
    a.save("pre-text.txt", pre);
  } finally {
    a.save("af-17.json", R);
    fs.writeFileSync(path.join(__dirname, "out", "af-17.json"), JSON.stringify(R, null, 2));
    await a.close();
  }
  console.log(JSON.stringify(R, null, 2));
}
main().catch((e) => { console.error(e); process.exit(1); });
