/**
 * File: t18-midcut-mutations.cjs
 * Description: Mutating the clip while it is being cut (delete a segment,
 *   reorder, close the tab), two tabs cutting at once, and whether keyboard
 *   reordering can move a segment more than one place.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, stubRoot, duration } = require("./boot.cjs");
const { live, allPanes, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";
const CLIPS = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/clips-t18";

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
    info: { id: "stub0000001", title: "Mutate", duration: 30, uploader: "Ch" },
    transcriptLines: 8, transcriptCueSec: 4, delayMs: 0, exitCode: 0, stderr: "", writeMedia: true,
  });
  const a = await boot({
    label: "t18-midcut", stub: STUB, viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });
  await loadLive(a, "https://www.youtube.com/watch?v=stub0000001");
  await a.win.waitForTimeout(600);

  // --- keyboard reorder, twice --------------------------------------------
  console.log("=== keyboard reorder: can a segment move more than one place? ===");
  await addSegment(a, "00:00:02", "00:00:05");
  await addSegment(a, "00:00:10", "00:00:13");
  await addSegment(a, "00:00:20", "00:00:24");
  console.log("start:", JSON.stringify((await live(a)).rows.map((r) => r.slice(0, 26))));
  await a.win.locator('button[aria-label^="Segment 3,"]').locator("visible=true").first().focus();
  console.log("focused:", await a.win.evaluate(() => document.activeElement?.getAttribute("aria-label")?.slice(0, 30)));
  await a.win.keyboard.press("Alt+ArrowUp");
  await a.win.waitForTimeout(400);
  console.log("after 1st Alt+Up:", JSON.stringify((await live(a)).rows.map((r) => r.slice(0, 26))));
  console.log("focus now:", await a.win.evaluate(() => document.activeElement?.getAttribute("aria-label")?.slice(0, 30) ?? document.activeElement?.tagName));
  await a.win.keyboard.press("Alt+ArrowUp");
  await a.win.waitForTimeout(400);
  console.log("after 2nd Alt+Up:", JSON.stringify((await live(a)).rows.map((r) => r.slice(0, 26))));
  console.log("announcement:", await a.win.evaluate(() => {
    const vis = Array.from(document.querySelectorAll("#ui-mark-in")).find((e) => e.offsetParent !== null);
    const pane = vis.closest("div.absolute.inset-0");
    return Array.from(pane.querySelectorAll('[role="status"].sr-only, span.sr-only')).map((e) => e.innerText).filter(Boolean);
  }));
  console.log("shot:", await a.shot("keyboard-reorder"));

  // --- delete a segment mid-cut -------------------------------------------
  console.log("\n=== delete a segment while the cut is running ===");
  stub.write({ delayMs: 4000 });
  stub.clearCalls();
  const before = clips();
  await a.win.click(S.cut);
  await a.win.waitForTimeout(2500);
  console.log("mid-cut rows:", JSON.stringify((await live(a)).rows.map((r) => r.slice(0, 26))));
  await a.win.locator('button[aria-label="Remove segment 2"]').locator("visible=true").first().click();
  await a.win.waitForTimeout(300);
  console.log("after removing #2 mid-cut:", JSON.stringify((await live(a)).rows.map((r) => r.slice(0, 26))));
  stub.write({ delayMs: 0 });
  await waitIdle(a);
  await a.win.waitForTimeout(1500);
  const made = clips().filter((f) => !before.includes(f));
  console.log("file produced:", JSON.stringify(made));
  for (const f of made) console.log(`  ${f}: ${duration(path.join(CLIPS, f)).seconds}s  (the cut was launched with 3 segments = 10s)`);
  console.log("sections the engine cut:", JSON.stringify(stub.calls().filter((c) => c.includes("--download-sections")).map((c) => c[c.indexOf("--download-sections") + 1])));
  console.log("rows left after the cut:", JSON.stringify((await live(a)).rows));
  console.log("shot:", await a.shot("deleted-midcut"));

  // --- two tabs cutting at once -------------------------------------------
  console.log("\n=== two tabs cutting at once ===");
  stub.write({ delayMs: 2500, info: { id: "tabtwo00001", title: "Tab two", duration: 30, uploader: "Ch" } });
  await a.win.click(S.newTab);
  await a.win.waitForTimeout(600);
  await loadLive(a, "https://www.youtube.com/watch?v=tabtwo00001", 4000);
  await addSegment(a, "00:00:06", "00:00:09");
  const before2 = clips();
  await a.win.click(S.cut);
  await a.win.waitForTimeout(1200);
  console.log("busy dots in the tab strip:", await a.win.locator('div[role="tab"] span.animate-pulse').count());
  // switch to tab 1 and start another cut there while tab 2 is busy
  (await a.win.locator(S.wsTabs).all())[0].click();
  await a.win.waitForTimeout(600);
  const l1 = await live(a);
  console.log("tab1 while tab2 is cutting:", JSON.stringify({ source: l1.source, rows: l1.rows.map((r) => r.slice(0, 26)), cutDisabled: l1.cutDisabled, cancel: l1.cancelVisible }));
  if (!l1.cutDisabled) {
    await a.win.click(S.cut);
    await a.win.waitForTimeout(1500);
    console.log("both cutting — busy dots:", await a.win.locator('div[role="tab"] span.animate-pulse').count());
    console.log("panes:", JSON.stringify(await allPanes(a)));
  } else {
    console.log("tab1 could not start a cut (nothing marked there any more)");
  }
  stub.write({ delayMs: 0 });
  await waitIdle(a, 180000);
  await a.win.waitForTimeout(3000);
  console.log("files after both:", JSON.stringify(clips().filter((f) => !before2.includes(f))));
  console.log("shot:", await a.shot("two-tabs"));

  // --- close the tab mid-cut ----------------------------------------------
  console.log("\n=== close the tab mid-cut ===");
  let dialog = null;
  a.win.on("dialog", async (d) => { dialog = d.message(); await d.accept(); });
  stub.write({ delayMs: 12000, info: { id: "closetab001", title: "Close me", duration: 30, uploader: "Ch" } });
  await a.win.click(S.newTab);
  await a.win.waitForTimeout(600);
  await loadLive(a, "https://www.youtube.com/watch?v=closetab001", 14000);
  await addSegment(a, "00:00:10", "00:00:14");
  const before3 = clips();
  await a.win.click(S.cut);
  await a.win.waitForTimeout(3000);
  console.log("cutting; busy dots:", await a.win.locator('div[role="tab"] span.animate-pulse').count());
  const tabs = await a.win.locator(S.wsTabs).all();
  await tabs[tabs.length - 1].hover();
  await a.win.locator('button[aria-label^="Close "]').last().click();
  await a.win.waitForTimeout(2000);
  console.log("confirm dialog:", JSON.stringify(dialog));
  console.log("tabs left:", (await a.win.locator(S.wsTabs).allInnerTexts()).map((t) => t.trim()));
  await a.win.waitForTimeout(30000);
  console.log("files after closing mid-cut:", JSON.stringify(clips().filter((f) => !before3.includes(f))), "(a cancelled job should write nothing)");
  console.log("stray yt-dlp:", require("node:child_process").execSync("ps -eo args | grep -c 'stubB/resources/bin/yt-dlp' || true").toString().trim());
  console.log("shot:", await a.shot("closed-midcut"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
