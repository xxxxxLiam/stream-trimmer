#!/usr/bin/env node
/**
 * AF-08 — F-6 / F-7: do MY planted secrets reach the on-screen alert, the
 * Copy-diagnostics bundle, the Copy-log clipboard, or the diagnostics panel
 * rendered on screen? Also F-5 (pre-flight bundle) and F-8 (gating).
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, clearCalls, jar, AUTH_TEXT } = require("./lib.cjs");
const { MARKERS, corpus, leaks } = require("./markers.cjs");

const CLIPS = "/tmp/af-clips-08";
const R = { markerCount: MARKERS.length };

const CAMPAIGN = {
  id: "camp_af8", name: "Audit AF", targetMinSec: 1, targetMaxSec: 600, hardMaxSec: 900,
  clipIdPattern: "{prefix}-{videoId}-{nn}", prefix: "AF", format: "mp4", quality: "360",
  clipsDir: CLIPS, dataDir: "/tmp/af-data-08", usedRanges: {},
};
const SEED = {
  "clipper.dataDirConfirmed": true,
  "clipper.campaigns": [CAMPAIGN],
  "clipper.activeCampaign": "camp_af8",
  "clipper.clipsDir": CLIPS,
  "clipper.saveDir": CLIPS,
  "clipper.saveDirs": [CLIPS],
};

const clip = (a) => a.app.evaluate(({ clipboard }) => clipboard.readText());

async function cut(win) {
  await win.fill("#ui-source-chip input", "https://www.youtube.com/watch?v=stub0000001");
  await win.press("#ui-source-chip input", "Enter");
  await win.waitForTimeout(3500);
  await win.fill("#ui-mark-in", "00:00:02");
  await win.fill("#ui-mark-out", "00:00:08");
  await win.waitForTimeout(300);
  await win.evaluate(() => document.getElementById("ui-cut")?.scrollIntoView({ block: "center" }));
  await win.click("#ui-cut", { timeout: 5000 });
  await win.waitForTimeout(7000);
}

const READ_UI = `({
  alerts: Array.from(document.querySelectorAll('[role="alert"]')).map(e => e.textContent),
  bodyText: document.body.innerText,
  copyButtons: Array.from(document.querySelectorAll('[role="alert"] button')).map(b => b.textContent.trim()),
})`;

async function main() {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });

  // ---------- phase 1: download-stage failure, signed in -------------------
  {
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      infoStage: {}, subs: {},
      downloadStage: { exitCode: 1, stderr: corpus() },
    });
    clearCalls();
    const a = await launch({ label: "af-08-p1", cookieFile: jar(), seed: SEED });
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(2500);
    await cut(a.win);
    const ui = await a.win.evaluate(READ_UI);
    R.p1_alertText = ui.alerts.join(" | ").replace(/\s+/g, " ").slice(0, 400);
    R.p1_alertLeaks = leaks(ui.alerts.join("\n"));
    R.p1_bodyLeaks = leaks(ui.bodyText);
    R.p1_copyButtons = ui.copyButtons;
    R.p1_shotAlert = await a.shot("download-failure-alert");

    // Copy diagnostics
    const btn = a.win.locator('[role="alert"] button', { hasText: "Copy diagnostics" });
    R.p1_copyDiagnosticsOffered = (await btn.count()) > 0;
    if (R.p1_copyDiagnosticsOffered) {
      await btn.first().click();
      await a.win.waitForTimeout(800);
      const text = await clip(a);
      R.p1_bundleBytes = text.length;
      R.p1_bundleLeaks = leaks(text);
      a.save("bundle-download-stage.txt", text);
    }

    // ground truth: the log on disk
    const logFile = path.join(a.userDataDir, "logs", "main.log");
    const raw = fs.existsSync(logFile) ? fs.readFileSync(logFile, "utf8") : "";
    R.p1_logFileLeaks = leaks(raw);
    a.save("main.log.leakreport.txt", JSON.stringify(R.p1_logFileLeaks, null, 2));

    // Copy log, from the chip menu (main-process redact)
    await a.win.click("#help-anchor-youtube-status");
    await a.win.waitForTimeout(300);
    await a.win.locator('[role="menu"] button', { hasText: "Copy log" }).first().click();
    await a.win.waitForTimeout(900);
    const logText = await clip(a);
    R.p1_copyLogBytes = logText.length;
    R.p1_copyLogLeaks = leaks(logText);
    a.save("copy-log-clipboard.txt", logText);

    // Now sign out so the connect modal (and its Diagnostics panel) comes back
    await a.win.click("#help-anchor-youtube-status");
    await a.win.waitForTimeout(300);
    await a.win.locator('[role="menu"] button', { hasText: "Forget this sign-in" }).first().click();
    await a.win.waitForTimeout(2500);
    await a.win.waitForSelector('[role="dialog"]', { timeout: 15000 });
    await a.win.locator('[role="dialog"] button', { hasText: "Diagnostics" }).first().click();
    await a.win.waitForTimeout(1500);
    const pre = await a.win.evaluate(
      () => document.querySelector('[role="dialog"] pre')?.textContent || "",
    );
    R.p1_onScreenPreBytes = pre.length;
    R.p1_onScreenPreLeaks = leaks(pre);
    R.p1_promiseSentence = await a.win.evaluate(() => {
      const ps = Array.from(document.querySelectorAll('[role="dialog"] p'));
      const p = ps.find((e) => /no cookies, tokens or personal data/.test(e.textContent || ""));
      return p ? p.textContent.replace(/\s+/g, " ").trim() : null;
    });
    a.save("diagnostics-pre-onscreen.txt", pre);
    R.p1_shotPre = await a.shot("diagnostics-panel-onscreen");
    await a.close();
  }

  // ---------- phase 2: pre-flight (metadata) failure: F-5 ------------------
  {
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      subs: {}, downloadStage: {},
      infoStage: {
        exitCode: 1,
        stderr:
          "ERROR: Traceback (most recent call last):\n  File \"yt_dlp/YoutubeDL.py\", line 1620, in wrapper\nTypeError: 'NoneType' object is not subscriptable\n" +
          corpus(),
      },
    });
    const a = await launch({ label: "af-08-p2", cookieFile: jar(), seed: SEED });
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(2500);
    // the video must load first, so info succeeds once then fails
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      subs: {}, downloadStage: {}, infoStage: {},
    });
    await a.win.fill("#ui-source-chip input", "https://www.youtube.com/watch?v=stub0000001");
    await a.win.press("#ui-source-chip input", "Enter");
    await a.win.waitForTimeout(3500);
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      subs: {}, downloadStage: {},
      infoStage: {
        exitCode: 1,
        stderr:
          "ERROR: Traceback (most recent call last):\n  File \"yt_dlp/YoutubeDL.py\", line 1620, in wrapper\nTypeError: 'NoneType' object is not subscriptable\n" +
          corpus(),
      },
    });
    await a.win.fill("#ui-mark-in", "00:00:02");
    await a.win.fill("#ui-mark-out", "00:00:08");
    await a.win.waitForTimeout(300);
    await a.win.evaluate(() => document.getElementById("ui-cut")?.scrollIntoView({ block: "center" }));
    await a.win.click("#ui-cut", { timeout: 5000 });
    await a.win.waitForTimeout(7000);
    const ui = await a.win.evaluate(READ_UI);
    R.p2_alertText = ui.alerts.join(" | ").replace(/\s+/g, " ").slice(0, 400);
    R.p2_alertLeaks = leaks(ui.alerts.join("\n"));
    R.p2_copyButtons = ui.copyButtons;
    R.p2_shot = await a.shot("preflight-failure");
    const btn = a.win.locator('[role="alert"] button', { hasText: "Copy diagnostics" });
    R.p2_copyDiagnosticsOffered = (await btn.count()) > 0;
    if (R.p2_copyDiagnosticsOffered) {
      await btn.first().click();
      await a.win.waitForTimeout(800);
      const text = await clip(a);
      R.p2_bundleBytes = text.length;
      R.p2_bundle = text;
      R.p2_bundleLeaks = leaks(text);
      R.p2_bundleHasStderr = !/engine stderr, this run only \(0 lines\)/.test(text);
      R.p2_bundleHasJob = !/Job: unknown/.test(text);
      R.p2_bundleHasLogLines = !/\(0 lines\)[\s\S]*\(none captured\)\s*$/.test(text);
      a.save("bundle-preflight.txt", text);
    }
    await a.close();
  }

  // ---------- phase 3: a user-fixable, code-less failure: F-8 --------------
  {
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      subs: {}, infoStage: {},
      downloadStage: {
        exitCode: 1,
        stderr: 'ERROR: could not find chrome cookies database in "/root/.config/google-chrome"',
      },
    });
    const a = await launch({
      label: "af-08-p3",
      cookieFile: jar(),
      seed: { ...SEED, "clipper.cookieBrowser": "chrome" },
    });
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(2500);
    await cut(a.win);
    const ui = await a.win.evaluate(READ_UI);
    R.p3_alertText = ui.alerts.join(" | ").replace(/\s+/g, " ").slice(0, 300);
    R.p3_copyButtons = ui.copyButtons;
    R.p3_copyDiagnosticsOffered = ui.copyButtons.some((t) => /Copy diagnostics/.test(t));
    R.p3_shot = await a.shot("cookie-store-failure");

    // control: a genuinely code-level failure must still offer it
    writeStub({
      auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
      subs: {}, infoStage: {},
      downloadStage: { exitCode: 1, stderr: "ERROR: Postprocessing: ffmpeg exited with code 234" },
    });
    await a.win.fill("#ui-mark-in", "00:00:03");
    await a.win.fill("#ui-mark-out", "00:00:09");
    await a.win.waitForTimeout(300);
    await a.win.click("#ui-cut", { timeout: 5000 });
    await a.win.waitForTimeout(7000);
    const ui2 = await a.win.evaluate(READ_UI);
    R.p3_controlAlert = ui2.alerts.join(" | ").replace(/\s+/g, " ").slice(0, 250);
    R.p3_controlCopyOffered = ui2.copyButtons.some((t) => /Copy diagnostics/.test(t));
    await a.close();
  }

  fs.writeFileSync(path.join(__dirname, "out", "af-08.json"), JSON.stringify(R, null, 2));
  const brief = { ...R };
  delete brief.p2_bundle;
  console.log(JSON.stringify(brief, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
