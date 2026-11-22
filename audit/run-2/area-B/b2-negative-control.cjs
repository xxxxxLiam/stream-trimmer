/**
 * File: b2-negative-control.cjs
 * Path: audit/run-2/area-B/b2-negative-control.cjs
 * Description: Settles B-2 (one global segment list shared by every tab) the same way as
 *   C-1: one script, three builds. Audit-only.
 *
 *   Usage: xvfb-run -a node b2-negative-control.cjs <head|rev0|rev1>
 *
 *   Carried all the way to a real file, as run 1 did: run 1 cut
 *   `Video AAA [00-00-02-00-00-05].mp4` at a range only ever marked on Video BBB.
 *   Here tab 1 marks 00:00:02-07 and 00:00:12-16 on AAA, tab 2 marks 00:00:20-25 on
 *   BBB, and the cut is launched FROM TAB 1. The file name, the sections the engine
 *   was given and the decoded duration all have to describe AAA's ranges only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, stubRoot, live, allPanes, alive, reactErrors, loadLive, markLive, duration, S, SP } = require("./lib.cjs");

const TREE = process.argv[2] || "head";
const STUB = `${SP}/stubB2`;
const CLIPS = `${SP}/clips-b2-${TREE}`;
const log = (...x) => console.log(`[b2:${TREE}]`, ...x);
const AAA = "aaaaaaaaaaa";
const BBB = "bbbbbbbbbbb";

(async () => {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  const stub = stubRoot(STUB);
  // fixture.mp4 is 30s, so the reported duration must match the media for the cut to mean something.
  stub.write({ info: { id: AAA, title: "Video AAA", duration: 30, uploader: "Ch" }, transcriptLines: 8, delayMs: 0, exitCode: 0, writeMedia: true });
  stub.clearCalls();

  const a = await boot({
    tree: TREE,
    label: `b2-${TREE}`,
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS] },
  });

  try {
    // --- tab 1: two segments on AAA -------------------------------------------------
    await loadLive(a, `https://www.youtube.com/watch?v=${AAA}`);
    await markLive(a, "00:00:02", "00:00:07");
    await a.win.click(S.add);
    await markLive(a, "00:00:12", "00:00:16");
    await a.win.click(S.add);
    log("TAB1 (AAA) two segments:", JSON.stringify(await live(a)));
    log("shot:", await a.shot("tab1-two-segments"));

    // --- open tab 2: does tab 1 lose its clip? --------------------------------------
    stub.write({ info: { id: BBB, title: "Video BBB", duration: 30, uploader: "Ch" } });
    await a.win.click(S.newTab);
    await a.win.waitForTimeout(1200);
    log("after opening tab 2 — ALL PANES:", JSON.stringify(await allPanes(a)));

    // --- tab 2: load BBB and mark a range only BBB ever had -------------------------
    await loadLive(a, `https://www.youtube.com/watch?v=${BBB}`);
    log("after loading BBB — ALL PANES:", JSON.stringify(await allPanes(a)));
    await markLive(a, "00:00:20", "00:00:25");
    await a.win.click(S.add);
    await a.win.waitForTimeout(600);
    log("after marking in tab 2 — ALL PANES:", JSON.stringify(await allPanes(a)));
    log("shot:", await a.shot("tab2-one-segment"));

    // --- back to tab 1 --------------------------------------------------------------
    const tabs = await a.win.locator(S.wsTabs).all();
    await tabs[0].click();
    await a.win.waitForTimeout(900);
    const t1 = await live(a);
    log("*** SWITCHED BACK TO TAB 1:", JSON.stringify(t1));
    log("shot:", await a.shot("tab1-after-switch-back"));

    // --- cut from tab 1 and inspect the real file -----------------------------------
    stub.write({ info: { id: AAA, title: "Video AAA", duration: 30, uploader: "Ch" } });
    stub.clearCalls();
    await a.win.click(S.cut);
    await a.win
      .waitForSelector('[role="status"]:has-text("Clip saved")', { timeout: 60000 })
      .catch(async () => log("no saved toast; alerts:", JSON.stringify(await a.win.locator('[role="alert"]').allInnerTexts())));
    await a.win.waitForTimeout(800);
    const files = fs.readdirSync(CLIPS);
    log("FILES:", JSON.stringify(files));
    for (const f of files) {
      const d = duration(path.join(CLIPS, f));
      log(`  ${f}: decoded=${d.seconds}s container=${d.header}s`);
    }
    log("sections the engine was given:", JSON.stringify(stub.calls().map((c) => c[c.indexOf("--download-sections") + 1]).filter((x) => x && x.startsWith("*"))));
    log("EXPECT: one file, ranges 2-7 and 12-16 only (9s). A 20-25 section means BBB's mark leaked.");
    log("after the cut — ALL PANES:", JSON.stringify(await allPanes(a)));
    log("shot:", await a.shot("after-cut-from-tab1"));
    log("alive:", JSON.stringify(await alive(a)), "react errors:", JSON.stringify(reactErrors(a)).slice(0, 200));
  } catch (e) {
    log("SCRIPT ERROR", e && e.message);
    log("alive at error:", JSON.stringify(await alive(a)));
    await a.shot("error").catch(() => {});
  }
  await a.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
