/**
 * File: v1-search.cjs
 * Path: audit/run-2/area-B/v1-search.cjs
 * Description: Re-runs run 1's B-1 against the fixed app, every route: type a query that
 *   matches, then (a) type one more character so nothing matches, (b) clear the box,
 *   (c) press Escape, (d) step with Enter / Shift+Enter past the end, (e) search while
 *   the transcript is still loading, (f) a 6,000-cue transcript. The marks and segments
 *   are in place first, so a crash would be visible as lost work. Audit-only.
 *
 *   Usage: xvfb-run -a node v1-search.cjs [head|rev0]
 */
const { boot, stubRoot, live, alive, reactErrors, loadLive, markLive, S, SP } = require("./lib.cjs");

const TREE = process.argv[2] || "head";
const STUB = `${SP}/stubB2`;
const log = (...x) => console.log(`[v1:${TREE}]`, ...x);
const VID = "search00001";

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: VID, title: "Search video", duration: 600, uploader: "Ch" }, transcriptLines: 40, transcriptCueSec: 4, delayMs: 0, exitCode: 0 });
  const a = await boot({ tree: TREE, label: `v1-${TREE}`, stub: STUB, viewport: { width: 1440, height: 900 } });
  const search = () => a.win.locator('input[placeholder="Find what was said"]').locator("visible=true").first();
  const counter = async () => {
    try { return await a.win.locator("#ui-col-transcript span.w-12").locator("visible=true").first().innerText(); }
    catch { return "<gone>"; }
  };

  try {
    await loadLive(a, `https://www.youtube.com/watch?v=${VID}`);
    await markLive(a, "00:00:10", "00:00:20");
    await a.win.click(S.add);
    await markLive(a, "00:01:00", "00:01:30");
    await a.win.click(S.add);
    log("before any search:", JSON.stringify(await live(a)));

    // (a) a match, then one character too many
    await search().fill("needle");
    await a.win.waitForTimeout(1200);
    log("searched 'needle': counter", JSON.stringify(await counter()), "alive", JSON.stringify(await alive(a)));
    await search().fill("needles");
    await a.win.waitForTimeout(1500);
    log("A) typed 'needles' (no match): counter", JSON.stringify(await counter()), "alive", JSON.stringify(await alive(a)));
    log("   segments still there:", JSON.stringify((await live(a))?.rows));
    log("   shot:", await a.shot("no-match"));

    // (b) clear the box
    await search().fill("needle");
    await a.win.waitForTimeout(900);
    await search().fill("");
    await a.win.waitForTimeout(1500);
    log("B) cleared the box: counter", JSON.stringify(await counter()), "alive", JSON.stringify(await alive(a)));
    log("   segments still there:", JSON.stringify((await live(a))?.rows));
    log("   shot:", await a.shot("cleared"));

    // (c) Escape
    await search().click();
    await a.win.keyboard.type("needle");
    await a.win.waitForTimeout(900);
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(1500);
    log("C) Escape: counter", JSON.stringify(await counter()), "alive", JSON.stringify(await alive(a)));
    log("   shot:", await a.shot("escape"));

    // (d) step past the end, then empty the set while the active index is high
    await search().fill("line");
    await a.win.waitForTimeout(1200);
    log("D) searched 'line': counter", JSON.stringify(await counter()));
    for (let i = 0; i < 8; i++) { await a.win.keyboard.press("Enter"); await a.win.waitForTimeout(120); }
    log("   after 8x Enter: counter", JSON.stringify(await counter()), "alive", JSON.stringify(await alive(a)));
    await search().fill("line 39");           // shrinks the set hard while active is high
    await a.win.waitForTimeout(1200);
    log("   narrowed to 'line 39': counter", JSON.stringify(await counter()), "alive", JSON.stringify(await alive(a)));
    await search().fill("zzzzzz");
    await a.win.waitForTimeout(1200);
    log("   then 'zzzzzz': counter", JSON.stringify(await counter()), "alive", JSON.stringify(await alive(a)));
    for (let i = 0; i < 4; i++) { await a.win.keyboard.press("Shift+Enter"); await a.win.waitForTimeout(120); }
    log("   Shift+Enter on an empty set: alive", JSON.stringify(await alive(a)));
    log("   shot:", await a.shot("stepping"));

    // (e) type while the transcript is reloading (new video, slow stub)
    stub.write({ info: { id: "slow0000001", title: "Slow video", duration: 600, uploader: "Ch" }, delayMs: 2500 });
    await loadLive(a, "https://www.youtube.com/watch?v=slow0000001", 300);
    await search().fill("need").catch(() => log("E) search box not mounted while loading"));
    await a.win.waitForTimeout(3500);
    await search().fill("").catch(() => {});
    await a.win.waitForTimeout(1200);
    log("E) searched during load then cleared: alive", JSON.stringify(await alive(a)), "counter", JSON.stringify(await counter()));
    stub.write({ delayMs: 0 });

    // (f) 6,000 cues
    stub.write({ info: { id: "big00000001", title: "Big transcript", duration: 24000, uploader: "Ch" }, transcriptLines: 6000, transcriptCueSec: 4 });
    await loadLive(a, "https://www.youtube.com/watch?v=big00000001", 4000);
    await a.win.waitForTimeout(2500);
    await search().fill("needle");
    await a.win.waitForTimeout(2500);
    log("F) 6,000 cues, 'needle': counter", JSON.stringify(await counter()), "alive", JSON.stringify(await alive(a)));
    await search().fill("needlez");
    await a.win.waitForTimeout(2500);
    log("   emptied the set: counter", JSON.stringify(await counter()), "alive", JSON.stringify(await alive(a)));
    log("   shot:", await a.shot("6000-cues"));

    log("react errors:", JSON.stringify(reactErrors(a)).slice(0, 400));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 400));
  } catch (e) {
    log("SCRIPT ERROR", e && e.message);
    log("alive at error:", JSON.stringify(await alive(a)));
    log("pageErrors:", JSON.stringify(a.logs.pageErrors).slice(0, 400));
    await a.shot("error").catch(() => {});
  }
  await a.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
