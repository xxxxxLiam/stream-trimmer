/**
 * File: t13-search-crash.cjs
 * Description: Minimal repro — typing a transcript search that stops matching
 *   takes the whole app to a white screen and loses every open tab's work.
 */
const { boot, stubRoot } = require("./boot.cjs");
const { S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "crash000001", title: "Search crash", duration: 600, uploader: "Ch" }, transcriptLines: 40, delayMs: 0 });
  const a = await boot({ label: "t13-search-crash", stub: STUB, viewport: { width: 1440, height: 900 } });
  await loadLive(a, "https://www.youtube.com/watch?v=crash000001");
  await a.win.waitForTimeout(800);

  // Real work in progress that will be lost.
  await markLive(a, "00:00:10", "00:00:20");
  await a.win.keyboard.press("Control+Shift+Enter");
  await markLive(a, "00:01:00", "00:01:20");
  await a.win.keyboard.press("Control+Shift+Enter");
  await a.win.waitForTimeout(400);
  console.log("segments before searching:", await a.win.locator('ol[aria-label^="Segments"] > li').count());
  console.log("shot:", await a.shot("before-search"));

  const search = a.win.locator('input[placeholder="Find what was said"]').locator("visible=true").first();
  await search.click();
  // Type it the way a person does, one key at a time.
  const word = "needless";
  for (const ch of word) {
    await a.win.keyboard.type(ch);
    await a.win.waitForTimeout(400);
    const state = await a.win.evaluate(() => ({
      alive: !!document.querySelector("#ui-mark-in"),
      bodyLen: (document.body.innerText || "").length,
      counter: document.querySelector("#ui-col-transcript span.w-12")?.innerText ?? null,
    }));
    console.log(`  typed "${ch}" -> query so far, alive=${state.alive} counter=${state.counter} bodyLen=${state.bodyLen}`);
    if (!state.alive) {
      console.log("  *** APP GONE. pageErrors:", JSON.stringify(a.logs.pageErrors));
      console.log("  shot:", await a.shot("white-screen"));
      break;
    }
  }

  // Does it come back by itself?
  await a.win.waitForTimeout(3000);
  console.log("\n10s later, still blank:", JSON.stringify(await a.win.evaluate(() => ({
    bodyLen: (document.body.innerText || "").length,
    html: document.getElementById("root") ? document.getElementById("root").innerHTML.length : null,
  }))));
  console.log("shot:", await a.shot("still-blank"));
  console.log("segments persisted anywhere?", JSON.stringify(Object.keys(a.readState())));

  // Only a reload brings it back — and the clip is gone.
  await a.win.reload();
  await a.win.waitForLoadState("domcontentloaded");
  await a.win.waitForFunction(() => document.querySelectorAll("#ui-mark-in").length > 0, null, { timeout: 30000 });
  console.log("\nafter reload — segments:", await a.win.locator('ol[aria-label^="Segments"] > li').count());
  console.log("after reload — source:", await a.win.locator("#ui-source-chip").innerText().catch(() => "(none)"));
  console.log("shot:", await a.shot("after-reload"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
