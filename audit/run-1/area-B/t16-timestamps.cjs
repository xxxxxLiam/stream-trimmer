/**
 * File: t16-timestamps.cjs
 * Description: Timestamp agreement across the timeline, the mark bar, the
 *   segment list and the saved filename, at 0s, 59s, 60s, 3599s, 3600s,
 *   86399s, 86400s and beyond 24h.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, stubRoot, duration } = require("./boot.cjs");
const { live, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";
const CLIPS = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/clips-t16";

const CASES = [
  ["0s", "0", "00:00:01"],
  ["59s", "00:00:59", "00:01:00"],
  ["60s", "00:01:00", "00:01:01"],
  ["3599s", "00:59:59", "01:00:00"],
  ["3600s", "01:00:00", "01:00:01"],
  ["86399s", "23:59:59", "24:00:00"],
  ["86400s", "24:00:00", "24:00:01"],
  ["beyond 24h", "25:30:45", "25:30:50"],
  ["beyond 100h", "100:00:00", "100:00:10"],
];

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  // A video longer than four days, so nothing is rejected for being past the end.
  stub.write({ info: { id: "longvid0001", title: "Four day stream", duration: 400000, uploader: "Ch" }, transcriptLines: 10, transcriptCueSec: 4, delayMs: 0, exitCode: 0, stderr: "", writeMedia: true });
  const a = await boot({
    label: "t16-timestamps", stub: STUB, viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });
  await loadLive(a, "https://www.youtube.com/watch?v=longvid0001");
  await a.win.waitForTimeout(800);

  console.log("timeline end label:", await a.win.evaluate(() => {
    const vis = Array.from(document.querySelectorAll("#ui-mark-in")).find((e) => e.offsetParent !== null);
    const pane = vis.closest("div.absolute.inset-0");
    const spans = pane.querySelectorAll('[role="slider"][aria-label="Video timeline"] ~ div span.font-mono');
    return Array.from(spans).map((s) => s.innerText);
  }), " (video is 400000s = 111:06:40)");
  console.log("header duration chip:", (await live(a)).source);

  console.log("\ncase | typed in/out | stitched total | segment row | timeline aria");
  for (const [name, i, o] of CASES) {
    await markLive(a, i, o);
    await a.win.waitForTimeout(350);
    const l = await live(a);
    const aria = await a.win.evaluate(() => {
      const vis = Array.from(document.querySelectorAll("#ui-mark-in")).find((e) => e.offsetParent !== null);
      const pane = vis.closest("div.absolute.inset-0");
      const mark = pane.querySelector('[title^="Marked "]');
      return mark ? mark.getAttribute("title") : null;
    });
    // add it so the segment row can be read, then remove it again
    let row = "(refused)";
    if (!l.addDisabled) {
      await a.win.keyboard.press("Control+Shift+Enter");
      await a.win.waitForTimeout(250);
      row = (await live(a)).rows[0] || "(none)";
      await a.win.locator('button[aria-label="Remove segment 1"]').locator("visible=true").first().click();
      await a.win.waitForTimeout(150);
    }
    console.log(`${name.padEnd(12)} | ${i} -> ${o} | ${l.total} | ${row} | ${aria}`);
  }
  console.log("shot:", await a.shot("timestamps"));

  // --- do the numbers on screen match the file? ---------------------------
  console.log("\n=== the saved file vs the numbers on screen ===");
  stub.write({ info: { id: "stub0000001", title: "Agreement", duration: 30, uploader: "Ch" } });
  await a.win.locator("#ui-source-chip button:has-text('Change')").locator("visible=true").first().click();
  await a.win.locator(S.urlInput).first().fill("https://www.youtube.com/watch?v=stub0000001");
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(2500);
  for (const [i, o] of [["00:00:00", "00:00:01"], ["00:00:05", "00:00:12"], ["00:00:25", "00:00:30"]]) {
    await markLive(a, i, o);
    await a.win.keyboard.press("Control+Shift+Enter");
    await a.win.waitForTimeout(250);
  }
  const l2 = await live(a);
  console.log("rows:", JSON.stringify(l2.rows));
  console.log("stitched total on screen:", l2.total, "(expected 00:00:13 = 1 + 7 + 5)");
  await a.win.click(S.cut);
  for (let i = 0; i < 180; i++) {
    await a.win.waitForTimeout(1000);
    if (!(await live(a)).cancelVisible) break;
  }
  await a.win.waitForTimeout(1500);
  const files = fs.readdirSync(CLIPS);
  console.log("files:", JSON.stringify(files));
  for (const f of files) {
    const d = duration(path.join(CLIPS, f));
    console.log(`  ${f}: decoded=${d.seconds}s container=${d.header}s`);
  }
  console.log("downloads row detail:", JSON.stringify((a.readState()["clipper.downloads"] || [])[0]));
  console.log("shot:", await a.shot("agreement"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
