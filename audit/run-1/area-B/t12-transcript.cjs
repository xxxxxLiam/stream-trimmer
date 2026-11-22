/**
 * File: t12-transcript.cjs
 * Description: Transcript load and windowing (does it draw everything at once?),
 *   search across the whole transcript, follow, and the used-ranges record drawn
 *   on the transcript and the timeline.
 */
const { boot, stubRoot } = require("./boot.cjs");
const { live, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";

const VID = "trans000001";

(async () => {
  const stub = stubRoot(STUB);
  // 6,000 cues at 4s each = a 6h40m video; a 3h stream with auto captions is
  // easily this size.
  stub.write({
    info: { id: VID, title: "Long stream", duration: 24000, uploader: "Ch" },
    transcriptLines: 6000,
    transcriptCueSec: 4,
    delayMs: 0,
  });

  const campaign = {
    id: "camp1",
    name: "Camp",
    targetMinSec: 30,
    targetMaxSec: 60,
    hardMaxSec: 90,
    clipIdPattern: "{prefix}-{videoId}-{nn}",
    prefix: "C",
    format: "mp4",
    quality: "best",
    clipsDir: "",
    dataDir: "",
    usedRanges: {
      [VID]: [
        { start: 20, end: 60, clipId: "C-001" },
        { start: 400, end: 460, clipId: "C-002" },
      ],
    },
  };

  const a = await boot({
    label: "t12-transcript",
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.campaigns": [campaign], "clipper.activeCampaign": "camp1" },
  });

  const t0 = Date.now();
  await loadLive(a, `https://www.youtube.com/watch?v=${VID}`, 500);
  // wait until the transcript header reports a count
  await a.win.waitForFunction(
    () => /\d[\d,]* lines/.test(document.body.innerText),
    null,
    { timeout: 60000 },
  );
  const loadMs = Date.now() - t0;
  console.log(`transcript ready in ~${loadMs}ms`);

  const m = async () =>
    a.win.evaluate(() => {
      const vis = Array.from(document.querySelectorAll("#ui-mark-in")).find((e) => e.offsetParent !== null);
      const pane = vis.closest("div.absolute.inset-0");
      const sc = pane.querySelector("#ui-col-transcript div.overflow-y-auto");
      return {
        header: pane.querySelector('#ui-col-transcript header span[aria-live="polite"]')?.innerText,
        domRows: pane.querySelectorAll("[data-line]").length,
        totalNodes: document.querySelectorAll("*").length,
        usedTags: Array.from(pane.querySelectorAll("[data-line]")).filter((r) => r.innerText.includes("used")).length,
        firstRow: pane.querySelector("[data-line]")?.innerText.replace(/\s+/g, " ").slice(0, 60),
        lastRow: Array.from(pane.querySelectorAll("[data-line]")).pop()?.innerText.replace(/\s+/g, " ").slice(0, 60),
        scrollH: sc ? sc.scrollHeight : null,
        clientH: sc ? sc.clientHeight : null,
      };
    });

  console.log("ON LOAD:", JSON.stringify(await m()));
  console.log("shot:", await a.shot("loaded-6000-lines"));

  // --- windowing: does "load later" cap the drawn set? --------------------
  console.log("\n=== growing the window ===");
  for (let i = 0; i < 6; i++) {
    const btn = a.win.locator('button:has-text("drawing the next")').locator("visible=true");
    if (!(await btn.count())) {
      console.log("  no 'drawing the next' button");
      break;
    }
    await btn.first().click();
    await a.win.waitForTimeout(500);
    const x = await m();
    console.log(`  after loadLater #${i + 1}: drawn=${x.domRows} header="${x.header}"`);
  }
  console.log("shot:", await a.shot("after-load-later"));

  // --- search over the whole transcript -----------------------------------
  console.log("\n=== search ===");
  const search = a.win.locator('input[placeholder="Find what was said"]').locator("visible=true").first();
  const tSearch = Date.now();
  await search.fill("needle in the haystack");
  await a.win.waitForTimeout(1500);
  console.log(`  search took ~${Date.now() - tSearch}ms`);
  console.log("  counter:", await a.win.locator("#ui-col-transcript span.w-12").locator("visible=true").first().innerText());
  console.log("  state:", JSON.stringify(await m()));
  // a phrase that spans two caption lines
  await search.fill("a phrase that wraps across two lines");
  await a.win.waitForTimeout(1200);
  console.log("  cross-line phrase counter:", await a.win.locator("#ui-col-transcript span.w-12").locator("visible=true").first().innerText());
  // a query with no hits
  await search.fill("zzzz-not-present");
  await a.win.waitForTimeout(1500);
  console.log("  no-hit:", JSON.stringify(await a.win.evaluate(() => {
    const col = Array.from(document.querySelectorAll('#ui-col-transcript')).find((e) => e.offsetParent !== null);
    if (!col) return { columnGone: true, body: document.body.innerText.slice(0, 200) };
    const counter = col.querySelector('span.w-12');
    return {
      counter: counter ? counter.innerText : null,
      counterVisible: counter ? counter.offsetParent !== null : null,
      message: (col.innerText.split('\n').find((l) => l.includes('No lines match')) || '(none)'),
      rows: col.querySelectorAll('[data-line]').length,
    };
  })));
  console.log("  pageErrors:", JSON.stringify(a.logs.pageErrors.slice(-2)));
  console.log("shot:", await a.shot("search-no-hits"));
  await search.fill("");
  await a.win.waitForTimeout(800);

  // --- used ranges on the transcript and the timeline ---------------------
  console.log("\n=== used-ranges record ===");
  const used = await a.win.evaluate(() => {
    const vis = Array.from(document.querySelectorAll("#ui-mark-in")).find((e) => e.offsetParent !== null);
    const pane = vis.closest("div.absolute.inset-0");
    const rows = Array.from(pane.querySelectorAll("[data-line]"));
    return {
      drawnRows: rows.length,
      rowsTaggedUsed: rows.filter((r) => r.innerText.includes("used")).length,
      firstUsedRow: rows.find((r) => r.innerText.includes("used"))?.innerText.replace(/\s+/g, " ").slice(0, 70) ?? null,
      hatchedOnTimeline: pane.querySelectorAll('[title^="Already used"]').length,
      legend: pane.querySelector("#ui-col-centre")?.innerText.includes("Used"),
    };
  });
  console.log(JSON.stringify(used));
  console.log("shot:", await a.shot("used-ranges"));

  // overlap warning when marking over a used range
  await markLive(a, "00:00:30", "00:00:50");
  await a.win.waitForTimeout(600);
  console.log("overlap warning:", (await a.win.locator("#ui-overlap-warning").locator("visible=true").first().innerText().catch(() => "(none)")).replace(/\s+/g, " "));
  console.log("cut disabled while unacknowledged:", await a.win.locator(S.cut).isDisabled());
  console.log("shot:", await a.shot("overlap-warning"));

  // --- follow the playhead -------------------------------------------------
  console.log("\n=== follow ===");
  await a.win.click('[role="slider"][aria-label="Video timeline"]', { position: { x: 600, y: 8 } });
  await a.win.waitForTimeout(900);
  console.log("after seeking to ~75% of the timeline:", JSON.stringify(await m()));
  console.log("shot:", await a.shot("followed"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
