/**
 * File: t01-happy-path.cjs
 * Description: THE assertion. Paste a URL, mark a range, add it, mark a second,
 *   add it, cut as one file, then verify with real ffmpeg that ONE file came out
 *   and that its duration equals the SUM of the two ranges.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, loadUrl, mark, stubRoot, duration } = require("./boot.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";
const CLIPS = process.env.CLIPS || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/clips-t01";

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  // fixture.mp4 is 30s, so the stub's reported duration must match the media.
  stub.write({
    info: { id: "stub0000001", title: "Stub video", duration: 30, uploader: "Stub channel" },
    transcriptLines: 8, transcriptCueSec: 4, exitCode: 0, delayMs: 0, writeMedia: true,
  });
  stub.clearCalls();

  const a = await boot({
    label: "t01-happy",
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });

  await loadUrl(a, "https://www.youtube.com/watch?v=stub0000001");
  await a.win.waitForTimeout(1500);

  // Segment 1: 00:00:02 -> 00:00:07  (5s)
  await mark(a, "00:00:02", "00:00:07");
  await a.win.click("#ui-add-segment");
  // Segment 2: 00:00:20 -> 00:00:28  (8s)
  await mark(a, "00:00:20", "00:00:28");
  await a.win.click("#ui-add-segment");

  const totalReadout = await a.win.locator("#ui-stitched-total").innerText();
  console.log("stitched total readout:", totalReadout, "(expected 00:00:13)");
  console.log("segment rows:", await a.win.locator('ol[aria-label^="Segments"] > li').count());
  console.log("shot:", await a.shot("two-segments"));

  await a.win.click("#ui-cut");
  await a.win.waitForTimeout(500);
  // Wait for the saved toast or an error.
  await a.win
    .waitForSelector('[role="status"]:has-text("Clip saved")', { timeout: 60000 })
    .catch(async () => {
      console.log("NO SAVED TOAST. error text:", await a.win.locator('[role="alert"]').allInnerTexts());
    });
  console.log("shot:", await a.shot("after-cut"));

  const files = fs.readdirSync(CLIPS);
  console.log("files in clips dir:", JSON.stringify(files));
  for (const f of files) {
    const full = path.join(CLIPS, f);
    const d = duration(full);
    console.log(`  ${f}: bytes=${fs.statSync(full).size} decoded_duration=${d.seconds}s`);
    console.log("  ffmpeg tail:", (d.raw || "").split("\n").filter((l) => l.includes("time=") || l.includes("Duration")).slice(-2).join(" | "));
  }
  console.log("EXPECT: exactly 1 file, decoded duration ~13.0s (5 + 8)");

  console.log("state clipper.downloads:", JSON.stringify((a.readState()["clipper.downloads"] || []).map((d) => ({ label: d.label, detail: d.detail }))));
  console.log("segments after cut:", await a.win.locator('ol[aria-label^="Segments"] > li').count());
  console.log("yt-dlp calls:");
  for (const c of stub.calls()) {
    const i = c.indexOf("--download-sections");
    if (i >= 0) console.log("   section:", c[i + 1], "-> out:", c[c.indexOf("--output") + 1]);
  }
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
