#!/usr/bin/env node
/**
 * AF-05 — the remaining persisted-skip paths the brief names:
 *   S6 skip -> import -> relaunch (is the skip really forgotten?)
 *   S7 skip -> import a well-formed cookies.txt that YouTube REJECTS
 *      (the chip menu's own "Import cookies.txt" route, drop variant)
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, writeStub, clearCalls, jar, AUTH_TEXT } = require("./lib.cjs");

const R = {};
const UI = `({
  dialogs: document.querySelectorAll('[role="dialog"]').length,
  chip: document.getElementById("help-anchor-youtube-status")?.textContent?.trim() || null,
  chipTitle: document.getElementById("help-anchor-youtube-status")?.getAttribute("title") || null,
  anyAlert: Array.from(document.querySelectorAll('[role="alert"]')).map(e => e.textContent.trim().slice(0,200)),
  visibleText: document.body.innerText.replace(/\\s+/g," ").slice(0,400),
})`;
const drop = (text) => `(async () => {
  const f = new File([${JSON.stringify(text)}], "cookies.txt", { type: "text/plain" });
  const dt = new DataTransfer(); dt.items.add(f);
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  return true;
})()`;

async function main() {
  // ---- S6: skip -> good import -> relaunch -------------------------------
  {
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      infoStage: {}, downloadStage: {},
    });
    const udd = fs.mkdtempSync(path.join(os.tmpdir(), "af-05-s6-"));
    fs.writeFileSync(
      path.join(udd, "settings.json"),
      JSON.stringify({ "clipper.dataDirConfirmed": true, "clipper.signInSkipped": true }),
    );
    let a = await launch({ label: "af-05-s6a", userDataDir: udd });
    await a.win.waitForTimeout(4000);
    await a.win.evaluate(drop(jar()));
    await a.win.waitForTimeout(3500);
    R.s6_afterImport = { ...(await a.win.evaluate(UI)), state: a.readState() };
    await a.close();

    a = await launch({ label: "af-05-s6b", userDataDir: udd });
    await a.win.waitForTimeout(5000);
    R.s6_relaunch = { ...(await a.win.evaluate(UI)), state: a.readState() };
    R.s6_shot = await a.shot("relaunch-after-import");
    await a.close();
  }

  // ---- S7: skipped, import a file YouTube rejects ------------------------
  {
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_out } },
      infoStage: {}, downloadStage: {},
    });
    const udd = fs.mkdtempSync(path.join(os.tmpdir(), "af-05-s7-"));
    fs.writeFileSync(
      path.join(udd, "settings.json"),
      JSON.stringify({ "clipper.dataDirConfirmed": true, "clipper.signInSkipped": true }),
    );
    const a = await launch({ label: "af-05-s7", userDataDir: udd });
    await a.win.waitForTimeout(4000);
    R.s7_before = await a.win.evaluate(UI);
    await a.win.evaluate(drop(jar()));
    await a.win.waitForTimeout(4000);
    R.s7_after = {
      ...(await a.win.evaluate(UI)),
      cookieFileOnDisk: fs.existsSync(path.join(udd, "yt-cookies.txt")),
      state: a.readState(),
    };
    R.s7_shot = await a.shot("rejected-import-while-skipped");
    // what the app knows but is not saying:
    R.s7_storeMessage = await a.win.evaluate(() => {
      // the connect store's message is only rendered inside the gate; reopen it
      return null;
    });
    // reopen the gate through the chip to see whether the message was kept
    await a.win.click("#help-anchor-youtube-status");
    await a.win.waitForTimeout(300);
    await a.win.locator('[role="menu"] button', { hasText: "Sign in" }).first().click();
    await a.win.waitForTimeout(600);
    R.s7_afterReopen = {
      dialogs: await a.win.locator('[role="dialog"]').count(),
      dialogAlert: await a.win.evaluate(
        () => document.querySelector('[role="dialog"] [role="alert"]')?.textContent.trim() || null,
      ),
    };
    R.s7_shot2 = await a.shot("gate-reopened-after-rejected-import");
    await a.close();
  }

  fs.writeFileSync(path.join(__dirname, "out", "af-05.json"), JSON.stringify(R, null, 2));
  console.log(JSON.stringify(R, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
