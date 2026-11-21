/**
 * File: t05-races.cjs
 * Description: Order of actions, repetition and races around the cut:
 *   double-click Cut, the same range twice, two tabs cutting at once, cancel
 *   then immediately re-cut, change the URL mid-cut, close the tab mid-cut,
 *   delete / reorder a segment mid-cut, and Add segment with no video loaded.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, stubRoot, duration } = require("./boot.cjs");
const { live, allPanes, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";
const CLIPS = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/clips-t05";

const tmpJobs = () =>
  fs.readdirSync("/tmp").filter((d) => d.startsWith("ytclip-"));
const listClips = () => fs.readdirSync(CLIPS).sort();

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  stub.write({
    info: { id: "stub0000001", title: "Race video", duration: 30, uploader: "Ch" },
    transcriptLines: 8, transcriptCueSec: 4, delayMs: 0, exitCode: 0, writeMedia: true,
  });

  const a = await boot({
    label: "t05-races",
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });

  // --- 0. Add segment with no video loaded --------------------------------
  console.log("=== 0. Add segment / Cut with no video loaded ===");
  console.log("mark fields disabled:", await a.win.locator("#ui-mark-in:visible").isDisabled());
  console.log("add disabled:", await a.win.locator(S.add).isDisabled(), "cut disabled:", await a.win.locator(S.cut).isDisabled());
  await a.win.click(S.add, { force: true });
  await a.win.click(S.cut, { force: true });
  await a.win.waitForTimeout(800);
  console.log("after forcing both:", JSON.stringify(await live(a)));

  await loadLive(a, "https://www.youtube.com/watch?v=stub0000001");

  // --- 1. double-click Cut -------------------------------------------------
  console.log("\n=== 1. double-click Cut ===");
  stub.write({ delayMs: 900 });
  stub.clearCalls();
  await markLive(a, "00:00:01", "00:00:04");
  await a.win.click(S.add);
  const cut = a.win.locator(S.cut);
  await cut.dblclick();
  await a.win.waitForTimeout(400);
  console.log("cut disabled during run:", await cut.isDisabled(), "cancel visible:", (await live(a)).cancelVisible);
  await a.win.waitForTimeout(16000);
  console.log("clips after double-click:", JSON.stringify(listClips()));
  console.log("download rows in state:", (a.readState()["clipper.downloads"] || []).length);
  console.log("shot:", await a.shot("double-click"));

  // --- 2. the same range twice --------------------------------------------
  console.log("\n=== 2. the same range twice ===");
  stub.write({ delayMs: 0 });
  await markLive(a, "00:00:01", "00:00:04");
  await a.win.click(S.add);
  await a.win.click(S.cut);
  await a.win.waitForTimeout(14000);
  const twice = listClips();
  console.log("clips now:", JSON.stringify(twice));
  console.log("  (same filename twice => overwritten, or suffixed?)");
  for (const f of twice) console.log("   ", f, fs.statSync(path.join(CLIPS, f)).size, "bytes");
  console.log("overlap warning shown:", await a.win.locator("#ui-overlap-warning:visible").count());
  console.log("shot:", await a.shot("same-range-twice"));

  // --- 3. cancel, then immediately re-cut ---------------------------------
  console.log("\n=== 3. cancel then immediately re-cut ===");
  stub.write({ delayMs: 6000 });
  await markLive(a, "00:00:10", "00:00:14");
  await a.win.click(S.add);
  await a.win.click(S.cut);
  await a.win.waitForTimeout(1200);
  console.log("mid-run:", JSON.stringify(await live(a)));
  await a.win.locator('button:has-text("Cancel")').locator("visible=true").first().click();
  await a.win.waitForTimeout(300);
  console.log("right after Cancel:", JSON.stringify(await live(a)));
  console.log("jobs left in /tmp:", JSON.stringify(tmpJobs()));
  console.log("shot:", await a.shot("after-cancel"));
  // immediately re-cut
  stub.write({ delayMs: 0 });
  const cutDisabledNow = await a.win.locator(S.cut).isDisabled();
  console.log("cut disabled immediately after cancel:", cutDisabledNow);
  await a.win.click(S.cut);
  await a.win.waitForTimeout(14000);
  console.log("clips after re-cut:", JSON.stringify(listClips()));
  console.log("segments left:", JSON.stringify((await live(a)).rows));
  console.log("shot:", await a.shot("after-recut"));

  // --- 4. change the URL mid-cut ------------------------------------------
  console.log("\n=== 4. change the URL mid-cut ===");
  stub.write({ delayMs: 7000 });
  await markLive(a, "00:00:20", "00:00:24");
  await a.win.click(S.add);
  await a.win.click(S.cut);
  await a.win.waitForTimeout(1200);
  stub.write({ info: { id: "ccccccccccc", title: "Other video", duration: 30, uploader: "Ch" } });
  await a.win.locator("#ui-source-chip button:has-text('Change')").locator("visible=true").first().click();
  const input = a.win.locator(S.urlInput).first();
  await input.fill("https://www.youtube.com/watch?v=ccccccccccc");
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(2500);
  console.log("mid-cut after URL change:", JSON.stringify(await live(a)));
  await a.win.waitForTimeout(16000);
  console.log("after it settles:", JSON.stringify(await live(a)));
  console.log("clips:", JSON.stringify(listClips()));
  console.log("downloads in state:", JSON.stringify((a.readState()["clipper.downloads"] || []).map((d) => d.label)));
  console.log("shot:", await a.shot("url-change-midcut"));

  // --- 5. delete / reorder a segment mid-cut ------------------------------
  console.log("\n=== 5. delete and reorder a segment mid-cut ===");
  stub.write({ delayMs: 0, info: { id: "stub0000001", title: "Race video", duration: 30, uploader: "Ch" } });
  await a.win.locator("#ui-source-chip button:has-text('Change')").locator("visible=true").first().click();
  await a.win.locator(S.urlInput).first().fill("https://www.youtube.com/watch?v=stub0000001");
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(2500);
  await markLive(a, "00:00:02", "00:00:05");
  await a.win.click(S.add);
  await markLive(a, "00:00:10", "00:00:13");
  await a.win.click(S.add);
  await markLive(a, "00:00:20", "00:00:23");
  await a.win.click(S.add);
  console.log("three segments:", JSON.stringify((await live(a)).rows));
  stub.write({ delayMs: 5000 });
  stub.clearCalls();
  const before5 = listClips();
  await a.win.click(S.cut);
  await a.win.waitForTimeout(1500);
  // delete segment 2 while the cut is running
  await a.win.locator('button[aria-label="Remove segment 2"]').locator("visible=true").first().click();
  await a.win.waitForTimeout(200);
  console.log("segments after deleting #2 mid-cut:", JSON.stringify((await live(a)).rows));
  await a.win.waitForTimeout(30000);
  const after5 = listClips().filter((f) => !before5.includes(f));
  console.log("new clip(s):", JSON.stringify(after5));
  for (const f of after5) {
    const d = duration(path.join(CLIPS, f));
    console.log(`   ${f} decoded=${d.seconds}s header=${d.header}s  (EXPECT 9s: the three ranges that were cut)`);
  }
  console.log("sections requested:", JSON.stringify(stub.calls().filter((c) => c.includes("--download-sections")).map((c) => c[c.indexOf("--download-sections") + 1])));
  console.log("segments left after the cut:", JSON.stringify((await live(a)).rows));
  console.log("shot:", await a.shot("delete-midcut"));

  // --- 6. two tabs cutting at once ----------------------------------------
  console.log("\n=== 6. two tabs cutting at once ===");
  stub.write({ delayMs: 3000 });
  await markLive(a, "00:00:03", "00:00:06");
  await a.win.click(S.add);
  await a.win.click(S.cut);
  await a.win.waitForTimeout(800);
  await a.win.click(S.newTab);
  await a.win.waitForTimeout(600);
  console.log("tab2 opened mid-cut. ALL PANES:", JSON.stringify(await allPanes(a)));
  console.log("tab strip busy dots:", await a.win.locator('div[role="tab"] span.animate-pulse').count());
  await loadLive(a, "https://www.youtube.com/watch?v=stub0000001", 3000);
  await markLive(a, "00:00:15", "00:00:18");
  await a.win.click(S.add);
  console.log("tab2 before its cut — ALL PANES:", JSON.stringify(await allPanes(a)));
  await a.win.click(S.cut);
  await a.win.waitForTimeout(25000);
  console.log("both tabs settled. clips:", JSON.stringify(listClips()));
  console.log("downloads in state:", JSON.stringify((a.readState()["clipper.downloads"] || []).map((d) => d.label)));
  console.log("shot:", await a.shot("two-tabs-cutting"));

  // --- 7. close the tab mid-cut -------------------------------------------
  console.log("\n=== 7. close the tab mid-cut ===");
  let dialogText = null;
  a.win.on("dialog", async (d) => {
    dialogText = d.message();
    await d.accept();
  });
  stub.write({ delayMs: 9000 });
  await markLive(a, "00:00:24", "00:00:28");
  await a.win.click(S.add);
  await a.win.click(S.cut);
  await a.win.waitForTimeout(1500);
  const tabsNow = await a.win.locator(S.wsTabs).all();
  await tabsNow[tabsNow.length - 1].hover();
  await a.win.locator('button[aria-label^="Close "]').last().click();
  await a.win.waitForTimeout(1500);
  console.log("confirm dialog text:", JSON.stringify(dialogText));
  console.log("tabs after close:", (await a.win.locator(S.wsTabs).allInnerTexts()).map((t) => t.trim()));
  const beforeClose = listClips();
  await a.win.waitForTimeout(20000);
  console.log("clips added after closing mid-cut:", JSON.stringify(listClips().filter((f) => !beforeClose.includes(f))));
  console.log("jobs left in /tmp:", JSON.stringify(tmpJobs()));
  console.log("shot:", await a.shot("closed-midcut"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
