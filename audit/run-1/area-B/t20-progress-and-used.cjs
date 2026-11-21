/**
 * File: t20-progress-and-used.cjs
 * Description: Download progress (does the bar actually move?) and the
 *   used-ranges record: after a cut inside a campaign, are the ranges written
 *   back and drawn on the transcript and the timeline?
 */
const fs = require("node:fs");
const { boot, stubRoot } = require("./boot.cjs");
const { live, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";
const CLIPS = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/clips-t20";
const VID = "used0000001";

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({
    info: { id: VID, title: "Used ranges", duration: 30, uploader: "Ch" },
    transcriptLines: 8, transcriptCueSec: 4, delayMs: 0, exitCode: 0, stderr: "",
    progress: [0, 10, 25, 40, 60, 80, 95, 100], writeMedia: true,
  });
  const campaign = {
    id: "camp1", name: "Camp", targetMinSec: 5, targetMaxSec: 60, hardMaxSec: 90,
    clipIdPattern: "{prefix}-{videoId}-{nn}", prefix: "C", format: "mp4", quality: "best",
    clipsDir: CLIPS, dataDir: CLIPS + "-data", usedRanges: {},
  };
  const a = await boot({
    label: "t20-used", stub: STUB, viewport: { width: 1440, height: 900 },
    seed: {
      "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS],
      "clipper.clipsDir": CLIPS, "clipper.dataDir": CLIPS + "-data",
      "clipper.campaigns": [campaign], "clipper.activeCampaign": "camp1",
    },
  });
  await loadLive(a, `https://www.youtube.com/watch?v=${VID}`);
  await a.win.waitForTimeout(600);
  await markLive(a, "00:00:04", "00:00:12");
  await a.win.keyboard.press("Control+Shift+Enter");
  await a.win.waitForTimeout(300);
  console.log("before the cut:", JSON.stringify(await live(a).then((l) => ({ rows: l.rows, total: l.total, status: l.status }))));

  // --- progress ------------------------------------------------------------
  stub.write({ delayMs: 1200 });
  await a.win.click(S.cut);
  const samples = [];
  for (let i = 0; i < 40; i++) {
    await a.win.waitForTimeout(400);
    const s = await a.win.evaluate(() => {
      const vis = Array.from(document.querySelectorAll("#ui-mark-in")).find((e) => e.offsetParent !== null);
      if (!vis) return null;
      const pane = vis.closest("div.absolute.inset-0");
      const label = Array.from(pane.querySelectorAll("span.font-mono")).map((e) => e.innerText).find((t) => /Downloading|Finishing|segment/i.test(t));
      const bar = pane.querySelector(".bg-range-fill");
      return { label: label ?? null, barWidth: bar ? Math.round(bar.getBoundingClientRect().width) : null };
    });
    if (s && s.label) samples.push(s);
    if (!(await live(a)).cancelVisible && samples.length) break;
  }
  console.log("progress samples:", JSON.stringify(samples.slice(0, 20)));
  console.log("distinct labels:", JSON.stringify([...new Set(samples.map((s) => s.label))]));
  await a.win.waitForTimeout(2500);
  console.log("shot:", await a.shot("after-cut"));

  // --- the used-ranges record ---------------------------------------------
  const state = a.readState();
  const camp = (state["clipper.campaigns"] || [])[0];
  console.log("\nusedRanges written back:", JSON.stringify(camp && camp.usedRanges));
  console.log("files:", JSON.stringify(fs.readdirSync(CLIPS)));
  console.log("after the cut:", JSON.stringify(await live(a).then((l) => ({ rows: l.rows, total: l.total }))));

  const drawn = await a.win.evaluate(() => {
    const vis = Array.from(document.querySelectorAll("#ui-mark-in")).find((e) => e.offsetParent !== null);
    const pane = vis.closest("div.absolute.inset-0");
    const rows = Array.from(pane.querySelectorAll("[data-line]"));
    return {
      transcriptRowsTaggedUsed: rows.filter((r) => r.innerText.includes("used")).length,
      transcriptRows: rows.length,
      hatchOnTimeline: pane.querySelectorAll('[title^="Already used"]').length,
      hatchTitles: Array.from(pane.querySelectorAll('[title^="Already used"]')).map((e) => e.title),
      legendShowsUsed: (pane.querySelector("#ui-col-centre")?.innerText || "").includes("Used"),
    };
  });
  console.log("drawn on screen:", JSON.stringify(drawn));
  console.log("shot:", await a.shot("used-drawn"));

  // marking the same range again should now warn
  await markLive(a, "00:00:06", "00:00:10");
  await a.win.waitForTimeout(600);
  const warn = await a.win.locator("#ui-overlap-warning").locator("visible=true").first().innerText().catch(() => "(none)");
  console.log("\noverlap warning:", warn.replace(/\s+/g, " "));
  console.log("cut blocked until acknowledged:", await a.win.locator(S.cut).isDisabled());
  await a.win.locator('button:has-text("Use it anyway")').locator("visible=true").first().click();
  await a.win.waitForTimeout(400);
  console.log("after 'Use it anyway' — cut enabled:", !(await a.win.locator(S.cut).isDisabled()));
  console.log("shot:", await a.shot("overlap"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
