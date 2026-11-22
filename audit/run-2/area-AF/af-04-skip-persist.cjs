#!/usr/bin/env node
/**
 * AF-04 — the NEW behaviour: the sign-in skip now persists across launches and
 * the status chip has a "Sign in…" item. Attacks:
 *   S1 skip, relaunch: is the gate gone, what does the chip say, does the
 *      invisible browser sweep still run?
 *   S2 persisted skip + a valid cookies.txt appearing on disk later
 *   S3 a cookies.txt dropped while skipped — good file and bad file
 *   S4 a skipped user presses Cut at the campaign's DEFAULT quality ("best")
 *   S5 the chip menu, "Sign in…", and what the reopened gate says
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, writeStub, clearCalls, calls, jar, AUTH_TEXT } = require("./lib.cjs");

const R = {};
const CLIPS = "/tmp/af-clips-04";

const CAMPAIGN = (quality) => ({
  id: "camp_af4",
  name: "Audit AF",
  targetMinSec: 1,
  targetMaxSec: 600,
  hardMaxSec: 900,
  clipIdPattern: "{prefix}-{videoId}-{nn}",
  prefix: "AF",
  format: "mp4",
  quality,
  clipsDir: CLIPS,
  dataDir: "/tmp/af-data-04",
  usedRanges: {},
});

const dropScript = (text) => `(async () => {
  const file = new File([${JSON.stringify(text)}], "cookies.txt", { type: "text/plain" });
  const dt = new DataTransfer();
  dt.items.add(file);
  window.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
  await new Promise((r) => setTimeout(r, 150));
  const overlay = document.body.innerText.includes("Drop cookies.txt to sign in");
  window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
  return { overlayShown: overlay };
})()`;

const ui = () => `({
  dialogs: document.querySelectorAll('[role="dialog"]').length,
  chip: document.getElementById("help-anchor-youtube-status")?.textContent?.trim() || null,
  chipTitle: document.getElementById("help-anchor-youtube-status")?.getAttribute("title") || null,
  anyAlert: Array.from(document.querySelectorAll('[role="alert"]')).map(e => e.textContent.trim().slice(0,200)),
  anyStatus: Array.from(document.querySelectorAll('[role="status"]')).map(e => e.textContent.trim().slice(0,160)).filter(Boolean),
  bodyMentionsCookie: /cookies\\.txt/i.test(document.body.innerText),
})`;

async function main() {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });

  // ---------------- S1: skip, then relaunch -------------------------------
  {
    writeStub({ auth: { ...AUTH_TEXT.profile_missing }, infoStage: {}, downloadStage: {} });
    const udd = fs.mkdtempSync(path.join(os.tmpdir(), "af-04-s1-"));
    clearCalls();
    let a = await launch({
      label: "af-04-s1a",
      userDataDir: udd,
      seed: { "clipper.dataDirConfirmed": true },
    });
    await a.win.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await a.win.waitForTimeout(1200);
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(400);
    R.s1_firstRun = { ...(await a.win.evaluate(ui())), state: a.readState() };
    await a.close();

    clearCalls();
    a = await launch({ label: "af-04-s1b", userDataDir: udd });
    await a.win.waitForTimeout(6000);
    R.s1_relaunch = {
      ...(await a.win.evaluate(ui())),
      state: a.readState(),
      sweepProcessesOnRelaunch: calls().filter((c) => c.argv.includes("--cookies-from-browser")).length,
      sweepSources: calls()
        .filter((c) => c.argv.includes("--cookies-from-browser"))
        .map((c) => c.argv[c.argv.indexOf("--cookies-from-browser") + 1]),
    };
    R.s1_shot = await a.shot("relaunch-after-skip");
    await a.close();
  }

  // ---------------- S2: persisted skip + a cookies.txt appears later ------
  {
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      infoStage: {},
      downloadStage: {},
    });
    const udd = fs.mkdtempSync(path.join(os.tmpdir(), "af-04-s2-"));
    fs.writeFileSync(
      path.join(udd, "settings.json"),
      JSON.stringify({ "clipper.dataDirConfirmed": true, "clipper.signInSkipped": true }),
    );
    fs.writeFileSync(path.join(udd, "yt-cookies.txt"), jar(), { mode: 0o600 });
    clearCalls();
    const a = await launch({ label: "af-04-s2", userDataDir: udd });
    await a.win.waitForTimeout(6000);
    R.s2 = { ...(await a.win.evaluate(ui())), state: a.readState() };
    R.s2_shot = await a.shot("skip-plus-cookie-file");
    await a.close();
  }

  // ---------------- S3: drops while skipped -------------------------------
  {
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      infoStage: {},
      downloadStage: {},
    });
    const udd = fs.mkdtempSync(path.join(os.tmpdir(), "af-04-s3-"));
    fs.writeFileSync(
      path.join(udd, "settings.json"),
      JSON.stringify({ "clipper.dataDirConfirmed": true, "clipper.signInSkipped": true }),
    );
    const a = await launch({ label: "af-04-s3", userDataDir: udd });
    await a.win.waitForTimeout(4000);
    R.s3_before = await a.win.evaluate(ui());

    // (a) a file that is NOT a cookies.txt
    R.s3_badDrop = await a.win.evaluate(dropScript("this is not a cookies file at all\n"));
    await a.win.waitForTimeout(2500);
    R.s3_afterBad = {
      ...(await a.win.evaluate(ui())),
      cookieFileOnDisk: fs.existsSync(path.join(udd, "yt-cookies.txt")),
    };
    R.s3_shotBad = await a.shot("after-bad-drop-while-skipped");

    // (b) a good one
    R.s3_goodDrop = await a.win.evaluate(dropScript(jar()));
    await a.win.waitForTimeout(3500);
    R.s3_afterGood = {
      ...(await a.win.evaluate(ui())),
      cookieFileOnDisk: fs.existsSync(path.join(udd, "yt-cookies.txt")),
      state: a.readState(),
    };
    R.s3_shotGood = await a.shot("after-good-drop-while-skipped");
    await a.close();
  }

  // ---------------- S4: skipped user cuts at the DEFAULT quality ----------
  {
    writeStub({ auth: { ...AUTH_TEXT.profile_missing }, infoStage: {}, downloadStage: {} });
    const a = await launch({
      label: "af-04-s4",
      seed: {
        "clipper.dataDirConfirmed": true,
        "clipper.signInSkipped": true,
        "clipper.campaigns": [CAMPAIGN("best")],
        "clipper.activeCampaign": "camp_af4",
        "clipper.clipsDir": CLIPS,
        "clipper.saveDir": CLIPS,
        "clipper.saveDirs": [CLIPS],
      },
    });
    await a.win.waitForTimeout(3000);
    R.s4_gate = (await a.win.locator('[role="dialog"]').count()) > 0;
    await a.win.fill("#ui-source-chip input", "https://www.youtube.com/watch?v=stub0000001");
    await a.win.press("#ui-source-chip input", "Enter");
    await a.win.waitForTimeout(3500);
    R.s4_qualityChip = await a.win.evaluate(
      () => document.getElementById("ui-footer-format")?.textContent?.trim() || null,
    );
    await a.win.fill("#ui-mark-in", "00:00:02");
    await a.win.fill("#ui-mark-out", "00:00:08");
    await a.win.waitForTimeout(300);
    await a.win.evaluate(() => document.getElementById("ui-cut")?.scrollIntoView({ block: "center" }));
    await a.win.click("#ui-cut", { timeout: 5000 });
    await a.win.waitForTimeout(6000);
    R.s4_after = {
      ...(await a.win.evaluate(ui())),
      clipsFolder: fs.readdirSync(CLIPS),
      buttonsInAlert: await a.win.evaluate(() =>
        Array.from(document.querySelectorAll('[role="alert"] button')).map((b) =>
          b.textContent.trim(),
        ),
      ),
    };
    R.s4_shot = await a.shot("skipped-cut-at-default-quality");
    await a.close();
  }

  // ---------------- S5: the chip menu and "Sign in…" -----------------------
  {
    writeStub({ auth: { ...AUTH_TEXT.profile_missing }, infoStage: {}, downloadStage: {} });
    const a = await launch({
      label: "af-04-s5",
      seed: { "clipper.dataDirConfirmed": true, "clipper.signInSkipped": true },
    });
    await a.win.waitForTimeout(6000);
    R.s5_beforeMenu = await a.win.evaluate(ui());
    await a.win.click("#help-anchor-youtube-status");
    await a.win.waitForTimeout(400);
    R.s5_menu = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[role="menu"] button')).map((b) => b.textContent.trim()),
    );
    R.s5_menuText = await a.win.evaluate(
      () => document.querySelector('[role="menu"] p')?.textContent.trim() || null,
    );
    R.s5_shotMenu = await a.shot("chip-menu-while-skipped");
    await a.win.locator('[role="menu"] button', { hasText: "Sign in" }).first().click();
    await a.win.waitForTimeout(700);
    R.s5_afterResume = {
      ...(await a.win.evaluate(ui())),
      state: a.readState(),
      dialogAlert: await a.win.evaluate(
        () => document.querySelector('[role="dialog"] [role="alert"]')?.textContent.trim() || null,
      ),
    };
    R.s5_shotResumed = await a.shot("gate-reopened-via-chip");
    // and back out again
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(400);
    R.s5_afterEscapeAgain = { ...(await a.win.evaluate(ui())), state: a.readState() };
    await a.close();
  }

  fs.writeFileSync(
    path.join(__dirname, "out", "af-04.json"),
    JSON.stringify(R, null, 2),
  );
  console.log(JSON.stringify(R, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
