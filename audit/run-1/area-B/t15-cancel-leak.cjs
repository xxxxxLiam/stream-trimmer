/**
 * File: t15-cancel-leak.cjs
 * Description: Does Cancel actually stop the engine? A yt-dlp that would run
 *   for ten minutes is started, cancelled, and then counted. Same after the
 *   app itself is killed.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const { boot, stubRoot } = require("./boot.cjs");
const { live, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";
const CLIPS = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/clips-t15";

const ytProcs = () => {
  try {
    // Only this area's stub: other audit helpers run their own.
    return execSync("ps -eo pid,etimes,args | grep 'stubB/resources/bin/yt-dlp' | grep -v grep")
      .toString().trim().split("\n").filter(Boolean);
  } catch {
    return [];
  }
};

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "stub0000001", title: "Leak video", duration: 30, uploader: "Ch" }, transcriptLines: 6, delayMs: 0, exitCode: 0 });
  console.log("yt-dlp processes before:", ytProcs().length);

  const a = await boot({
    label: "t15-leak", stub: STUB, viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });
  await loadLive(a, "https://www.youtube.com/watch?v=stub0000001");
  await a.win.waitForTimeout(600);
  await markLive(a, "00:00:02", "00:00:08");
  await a.win.keyboard.press("Control+Shift+Enter");

  // From here on every yt-dlp run would take ten minutes.
  stub.write({ delayMs: 600000 });
  await a.win.click(S.cut);
  await a.win.waitForTimeout(4000);
  console.log("during the cut:", ytProcs().length, "yt-dlp process(es)");
  ytProcs().forEach((p) => console.log("   ", p.slice(0, 120)));

  await a.win.locator('button:has-text("Cancel")').locator("visible=true").first().click();
  await a.win.waitForTimeout(15000);
  const after = ytProcs();
  console.log("\n15s after Cancel:", after.length, "yt-dlp process(es) still running");
  after.forEach((p) => console.log("   ", p.slice(0, 120)));
  console.log("UI says:", JSON.stringify(await live(a).then((l) => ({ cancel: l.cancelVisible, status: l.status }))));
  console.log("shot:", await a.shot("after-cancel"));

  // Now start another and kill the app outright.
  await a.win.click(S.cut);
  await a.win.waitForTimeout(4000);
  console.log("\nbefore SIGKILL:", ytProcs().length, "yt-dlp process(es)");
  a.app.process().kill("SIGKILL");
  await new Promise((r) => setTimeout(r, 6000));
  const orphans = ytProcs();
  console.log("6s after the app was killed:", orphans.length, "yt-dlp process(es) still running");
  orphans.forEach((p) => console.log("   ", p.slice(0, 120)));
  // tidy up so later scripts are not confused
  try { execSync("pkill -f 'resources/bin/yt-dlp' || true"); } catch {}
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
