#!/usr/bin/env node
/**
 * AF-02 — A-1 second half: a user with no cookies.txt who takes the
 * "Continue without signing in (360p)" route must be able to CUT A CLIP.
 * Drives the real UI end to end and checks the bytes on disk.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { launch, writeStub, clearCalls, calls, AUTH_TEXT } = require("./lib.cjs");

const R = {};
const CLIPS = "/tmp/af-clips-02";

async function main() {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  writeStub({
    auth: { ...AUTH_TEXT.profile_missing },
    infoStage: { exitCode: 0 },
    downloadStage: { exitCode: 0, writeMedia: true },
  });
  clearCalls();

  const campaign = {
    id: "camp_af2",
    name: "Audit AF",
    targetMinSec: 1,
    targetMaxSec: 600,
    hardMaxSec: 900,
    clipIdPattern: "{prefix}-{videoId}-{nn}",
    prefix: "AF",
    format: "mp4",
    quality: "360",
    clipsDir: CLIPS,
    dataDir: "/tmp/af-data-02",
    usedRanges: {},
  };

  const a = await launch({
    label: "af-02-skip360",
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.campaigns": [campaign],
      "clipper.activeCampaign": "camp_af2",
      "clipper.clipsDir": CLIPS,
      "clipper.saveDir": CLIPS,
      "clipper.saveDirs": [CLIPS],
    },
  });
  try {
    await a.win.waitForSelector('[role="dialog"]', { timeout: 30000 });
    await a.win.waitForTimeout(1200);
    R.gateOpen = true;
    await a.win
      .locator('[role="dialog"] button', { hasText: "Continue without signing in" })
      .first()
      .click();
    await a.win.waitForTimeout(400);
    R.gateGone = (await a.win.locator('[role="dialog"]').count()) === 0;
    R.shot_after_skip = await a.shot("after-skip");

    // paste a link
    await a.win.fill("#ui-source-chip input", "https://www.youtube.com/watch?v=stub0000001");
    await a.win.press("#ui-source-chip input", "Enter");
    await a.win.waitForTimeout(3500);
    R.infoLoaded = await a.win.evaluate(() => document.body.innerText.includes("Stub video"));
    R.quality = await a.win.evaluate(
      () => document.getElementById("ui-footer-format")?.textContent?.trim() || null,
    );

    // mark a range and cut
    await a.win.fill("#ui-mark-in", "00:00:02");
    await a.win.fill("#ui-mark-out", "00:00:08");
    await a.win.waitForTimeout(300);
    R.cutEnabled = await a.win.evaluate(() => {
      const b = document.getElementById("ui-cut");
      return b ? { text: b.textContent.trim(), disabled: b.disabled } : null;
    });
    R.shot_marked = await a.shot("marked");
    await a.win.evaluate(() => document.getElementById("ui-cut")?.scrollIntoView({ block: "center" }));
    await a.win.click("#ui-cut", { timeout: 5000 });

    for (let i = 0; i < 60; i++) {
      await a.win.waitForTimeout(500);
      const done = await a.win.evaluate(
        () => document.body.innerText.includes("Clip saved") || !!document.querySelector('[role="alert"]'),
      );
      if (done) break;
    }
    await a.win.waitForTimeout(800);
    R.shot_done = await a.shot("after-cut");
    R.alert = await a.win.evaluate(() => {
      const el = document.querySelector('[role="alert"]');
      return el ? el.textContent.trim().slice(0, 300) : null;
    });
    R.toast = await a.win.evaluate(() => {
      const t = Array.from(document.querySelectorAll('[role="status"]')).map((e) =>
        e.textContent.trim().slice(0, 120),
      );
      return t.filter(Boolean);
    });

    const files = fs.existsSync(CLIPS) ? fs.readdirSync(CLIPS) : [];
    R.clipsFolder = files;
    if (files.length) {
      const f = path.join(CLIPS, files[0]);
      const st = fs.statSync(f);
      const head = fs.readFileSync(f).subarray(0, 12).toString("hex");
      let probe = "";
      try {
        probe = execFileSync(
          path.join("/home/user/stream-trimmer", "resources", "bin", "ffmpeg"),
          ["-hide_banner", "-i", f],
          { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
        );
      } catch (e) {
        probe = String(e.stderr || e.message);
      }
      R.clip = {
        name: files[0],
        bytes: st.size,
        head12: head,
        isMp4: head.includes("66747970"),
        duration: (/Duration: ([0-9:.]+)/.exec(probe) || [])[1] || null,
        video: (/Stream #0:0.*Video: ([^\n]+)/.exec(probe) || [])[1] || null,
      };
    }
    // What the engine was actually asked for.
    R.downloadArgv = calls()
      .filter((c) => !c.argv.includes("--version") && !c.argv.includes("--simulate") && !c.argv.includes("-J"))
      .map((c) => c.argv.join(" ").slice(0, 300));
    R.cookieFlagUsed = calls().some((c) => c.argv.includes("--cookies"));
    R.state = a.readState();
  } finally {
    const f = a.save("af-02.json", R);
    await a.close();
    console.log("wrote", f);
  }
  console.log(JSON.stringify(R, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
