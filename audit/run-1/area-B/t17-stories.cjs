/**
 * File: t17-stories.cjs
 * Description: Realistic user stories for the core clipping loop, run end to
 *   end against the real app. Each story prints what the clipper would see.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, stubRoot, duration } = require("./boot.cjs");
const { live, allPanes, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";
const CLIPS = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/clips-t17";

const clips = () => fs.readdirSync(CLIPS).sort();
async function waitIdle(a, ms = 150000) {
  const t0 = Date.now();
  for (;;) {
    const l = await live(a).catch(() => null);
    if (!l || !l.cancelVisible) return true;
    if (Date.now() - t0 > ms) return false;
    await a.win.waitForTimeout(500);
  }
}
/** Add a segment the only way that always works (the mouse target can be covered). */
async function addSegment(a, i, o) {
  await markLive(a, i, o);
  await a.win.waitForTimeout(200);
  await a.win.keyboard.press("Control+Shift+Enter");
  await a.win.waitForTimeout(250);
}

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({
    info: { id: "stub0000001", title: "Interview", duration: 30, uploader: "Ch" },
    transcriptLines: 8, transcriptCueSec: 4, delayMs: 0, exitCode: 0, writeMedia: true, signedIn: true,
  });

  const a = await boot({
    label: "t17-stories", stub: STUB, viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });

  // ---- Story 1: find a line in the transcript and clip around it ---------
  console.log("## Story 1 — find a quote in the transcript and clip it");
  await loadLive(a, "https://www.youtube.com/watch?v=stub0000001");
  await a.win.waitForTimeout(600);
  const search = a.win.locator('input[placeholder="Find what was said"]').locator("visible=true").first();
  await search.fill("needle");
  await a.win.waitForTimeout(900);
  console.log("  match counter:", await a.win.locator("#ui-col-transcript span.w-12").locator("visible=true").first().innerText());
  // click the matching line to seek, then drag-select it as a range
  const row = a.win.locator('[data-line]:has-text("needle")').locator("visible=true").first();
  await row.click();
  await a.win.waitForTimeout(400);
  console.log("  after clicking the line:", JSON.stringify(await live(a).then((l) => ({ in: l.markIn, out: l.markOut }))));
  await search.fill("");
  await a.win.waitForTimeout(600);

  // ---- Story 2: shift-click two transcript lines to set a range ----------
  console.log("\n## Story 2 — shift-click two transcript lines to set the range");
  const rows = a.win.locator("[data-line]").locator("visible=true");
  await rows.nth(1).click();
  await a.win.waitForTimeout(300);
  await rows.nth(3).click({ modifiers: ["Shift"] });
  await a.win.waitForTimeout(400);
  console.log("  range set from the transcript:", JSON.stringify(await live(a).then((l) => ({ in: l.markIn, out: l.markOut, total: l.total }))));
  console.log("  shot:", await a.shot("story2-transcript-range"));

  // ---- Story 3: three segments, reordered, cut as one --------------------
  console.log("\n## Story 3 — three segments, reordered, cut as one file");
  await addSegment(a, "00:00:02", "00:00:05"); // A, 3s
  await addSegment(a, "00:00:10", "00:00:13"); // B, 3s
  await addSegment(a, "00:00:20", "00:00:24"); // C, 4s
  console.log("  rows:", JSON.stringify((await live(a)).rows));
  // move the last one to the top with the keyboard
  const third = a.win.locator('button[aria-label^="Segment 3,"]').locator("visible=true").first();
  await third.focus();
  await a.win.keyboard.press("Alt+ArrowUp");
  await a.win.waitForTimeout(200);
  await a.win.keyboard.press("Alt+ArrowUp");
  await a.win.waitForTimeout(400);
  const reordered = (await live(a)).rows;
  console.log("  after Alt+Up twice:", JSON.stringify(reordered));
  console.log("  total on screen:", (await live(a)).total, "(expected 00:00:10)");
  stub.clearCalls();
  await a.win.click(S.cut);
  await waitIdle(a);
  await a.win.waitForTimeout(1500);
  const made = clips();
  console.log("  file(s):", JSON.stringify(made));
  for (const f of made) {
    const d = duration(path.join(CLIPS, f));
    console.log(`    ${f}: decoded=${d.seconds}s (expected 10s)`);
  }
  const order = stub.calls().filter((c) => c.includes("--download-sections")).map((c) => [c[c.indexOf("--download-sections") + 1], path.basename(c[c.indexOf("--output") + 1])]);
  console.log("  join order the engine was given:", JSON.stringify(order), "(seg-01 must be *20.00-24.00)");
  console.log("  shot:", await a.shot("story3-reordered-cut"));

  // ---- Story 4: cut the same quote again by mistake ----------------------
  console.log("\n## Story 4 — cut the same range again by mistake");
  const before4 = clips();
  await addSegment(a, "00:00:02", "00:00:05");
  await a.win.click(S.cut);
  await waitIdle(a);
  await a.win.waitForTimeout(1200);
  await addSegment(a, "00:00:02", "00:00:05");
  console.log("  warning before the second cut:", await a.win.locator("#ui-overlap-warning").locator("visible=true").count());
  await a.win.click(S.cut);
  await waitIdle(a);
  await a.win.waitForTimeout(1200);
  const after4 = clips().filter((f) => !before4.includes(f));
  console.log("  new files:", JSON.stringify(after4), "(two cuts of the same range)");
  console.log("  history rows:", JSON.stringify((a.readState()["clipper.downloads"] || []).slice(0, 3).map((d) => d.label)));
  console.log("  shot:", await a.shot("story4-duplicate"));

  // ---- Story 5: the video has been taken down ----------------------------
  console.log("\n## Story 5 — the source has been taken down since you banked it");
  stub.write({ exitCode: 1, stderr: "ERROR: [youtube] gone0000001: Video unavailable. This video is no longer available because the uploader has closed their YouTube account." });
  await a.win.locator("#ui-source-chip button:has-text('Change')").locator("visible=true").first().click();
  await a.win.locator(S.urlInput).first().fill("https://www.youtube.com/watch?v=gone0000001");
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(4000);
  const l5 = await live(a);
  console.log("  what the user sees:", JSON.stringify({ status: l5.status, alert: l5.alert, transcript: l5.transcriptHeader }));
  console.log("  shot:", await a.shot("story5-video-gone"));
  stub.write({ exitCode: 0, stderr: "" });

  // ---- Story 6: a Shorts link and a timestamped link ---------------------
  console.log("\n## Story 6 — a Shorts link, then a link with ?t=");
  stub.write({ info: { id: "short000001", title: "A short", duration: 30, uploader: "Ch" } });
  await a.win.locator(S.urlInput).first().fill("https://www.youtube.com/shorts/short000001");
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(3000);
  console.log("  shorts:", JSON.stringify(await live(a).then((l) => ({ source: l.source, out: l.markOut }))));
  await a.win.locator("#ui-source-chip button:has-text('Change')").locator("visible=true").first().click();
  await a.win.locator(S.urlInput).first().fill("https://www.youtube.com/watch?v=stub0000001&t=90s&si=TRACKING");
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(3000);
  console.log("  timestamped:", JSON.stringify(await live(a).then((l) => ({ source: l.source, in: l.markIn, out: l.markOut }))), "(does ?t=90 preset the in point?)");
  console.log("  shot:", await a.shot("story6-url-variants"));

  // ---- Story 7: two videos in two tabs, cut from each ---------------------
  console.log("\n## Story 7 — two videos open, cut from each in turn");
  await addSegment(a, "00:00:04", "00:00:08");
  console.log("  tab1 has:", JSON.stringify((await live(a)).rows));
  stub.write({ info: { id: "second00001", title: "Second video", duration: 30, uploader: "Ch" } });
  await a.win.click(S.newTab);
  await a.win.waitForTimeout(700);
  await loadLive(a, "https://www.youtube.com/watch?v=second00001", 3000);
  console.log("  after opening tab2 and loading another video — both panes:", JSON.stringify(await allPanes(a)));
  await addSegment(a, "00:00:15", "00:00:19");
  console.log("  after marking in tab2 — both panes:", JSON.stringify(await allPanes(a)));
  console.log("  shot:", await a.shot("story7-two-tabs"));
  const before7 = clips();
  await a.win.click(S.cut);
  await waitIdle(a);
  await a.win.waitForTimeout(1500);
  console.log("  cut from tab2 produced:", JSON.stringify(clips().filter((f) => !before7.includes(f))));
  // now go back to tab 1 and cut what it shows
  (await a.win.locator(S.wsTabs).all())[0].click();
  await a.win.waitForTimeout(800);
  const l7 = await live(a);
  console.log("  back on tab1 (Interview):", JSON.stringify({ source: l7.source, rows: l7.rows }));
  console.log("  shot:", await a.shot("story7-back-on-tab1"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
