/**
 * File: b01-c1-negative-control.cjs
 * Path: audit/run-2/area-B/b01-c1-negative-control.cjs
 * Description: C-1 ("two tabs + a non-empty bank blanks the app") with a real negative
 *   control. ONE script, run against three app trees:
 *
 *     ROOT=<scratch>/ctrlA  the run-1 code (one module-level segment store)  -> must CRASH
 *     ROOT=<scratch>/ctrlB  the fixed tree with ONLY ClipsColumn's call site reverted
 *                           (seg.setBanked(planned) -> setBankedRanges(planned))
 *     ROOT=/home/user/stream-trimmer  the real tree
 *
 *   Precondition that matters (and that a previous attempt got wrong): BOTH tabs must be
 *   showing the SAME video, and the bank row must still be PLANNED (status "banked"), so
 *   both mounted ClipsColumns compute a non-empty plan. A tab with no video, or a row
 *   already marked cut, computes an empty plan and does not exercise the writer conflict.
 *
 *   A crash here is any of: #root emptied, the ErrorBoundary fallback painted, a
 *   "Minified React error" in the renderer console, or a renderer that stops answering.
 *
 * Usage: ROOT=... xvfb-run -a --server-args="-screen 0 1440x900x24" node b01-c1-negative-control.cjs
 */
const { boot, crashState, live, allPanes, loadLive, markLive, seedBank, stubRoot, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
const VID = "aaaaaaaaaaa";

let worst = null;
async function report(a, what) {
  const c = await crashState(a);
  const flag = c.crashed ? "*** CRASHED ***" : "alive";
  console.log(
    `[${what}] ${flag} rootChildren=${c.rootChildren} bodyLen=${c.bodyLen} panes=${c.panes} ` +
      `boundary=${c.boundary} answering=${c.answering} reactErrors=${c.reactErrorCount}`,
  );
  if (c.boundaryMessage) console.log(`      boundary says: ${c.boundaryMessage}`);
  for (const e of c.reactErrors) console.log(`      ${e.slice(0, 200)}`);
  if (c.crashed && !worst) worst = what;
  return c;
}

(async () => {
  console.log(`=== C-1 negative control ===\nROOT=${ROOT}\nTAG=${TAG}\n`);
  const stub = stubRoot(STUB);
  stub.write({
    info: { id: VID, title: "Video AAA", duration: 600, uploader: "Ch" },
    transcriptLines: 12,
  });

  const a = await boot({
    label: `b01-c1-${TAG}`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    // A campaign with ONE bank row that is still planned for video AAA.
    seed: seedBank({ videoId: VID }),
  });

  await report(a, "booted");
  console.log("bank seeded as:", JSON.stringify(a.readState()["clipper.bank"]));

  // --- step 1: tab 1 shows AAA, so its ClipsColumn has a non-empty plan
  await loadLive(a, `https://www.youtube.com/watch?v=${VID}`);
  let c = await report(a, "tab1 loaded AAA");
  if (!c.crashed) {
    console.log("    pane:", JSON.stringify(await live(a)));
    const bankText = await a.win
      .evaluate(() => {
        const col = document.querySelector('#ui-col-clips, [id^="ui-col-clips"]');
        return (col?.innerText || document.body.innerText).replace(/\s+/g, " ").slice(0, 300);
      })
      .catch(() => "?");
    console.log("    clips column:", bankText);
    console.log("    shot:", await a.shot("tab1-aaa-with-bank"));
  }

  // --- step 2: open a second tab (run 1's crash point)
  if (!c.crashed) {
    await a.win.click(S.newTab, { timeout: 10000 }).catch((e) => console.log("    click + failed:", String(e).slice(0, 90)));
    await a.win.waitForTimeout(2500);
    c = await report(a, "second tab opened (no video yet)");
    console.log("    shot:", await a.shot("two-tabs-second-empty"));
  }

  // --- step 3: the precondition that matters — tab 2 shows the SAME video
  if (!c.crashed) {
    await loadLive(a, `https://www.youtube.com/watch?v=${VID}`).catch((e) =>
      console.log("    load in tab 2 failed:", String(e).slice(0, 90)),
    );
    await a.win.waitForTimeout(2500);
    c = await report(a, "tab2 loaded the SAME video AAA");
    if (!c.crashed) {
      console.log("    ALL PANES:", JSON.stringify(await allPanes(a)));
      console.log("    pane:", JSON.stringify(await live(a)));
    }
    console.log("    shot:", await a.shot("two-tabs-same-video"));
  }

  // --- step 4: switch between them a few times (each switch re-points the active store)
  if (!c.crashed) {
    for (let i = 0; i < 4 && !c.crashed; i++) {
      const tabs = await a.win.locator(S.wsTabs).all();
      await tabs[i % 2].click({ timeout: 8000 }).catch(() => {});
      await a.win.waitForTimeout(900);
      c = await report(a, `switch #${i + 1} -> tab ${(i % 2) + 1}`);
    }
    console.log("    shot:", await a.shot("after-switching"));
  }

  // --- step 5: mark and add in the tab on screen, with the bank live in both
  if (!c.crashed) {
    await markLive(a, "00:00:10", "00:00:20").catch(() => {});
    await a.win.click(S.add, { timeout: 8000 }).catch(() => {});
    await a.win.waitForTimeout(1200);
    c = await report(a, "added a segment with the bank live in two tabs");
    if (!c.crashed) console.log("    ALL PANES:", JSON.stringify(await allPanes(a)));
  }

  // --- step 6: a third tab on the same video
  if (!c.crashed) {
    await a.win.click(S.newTab, { timeout: 8000 }).catch(() => {});
    await a.win.waitForTimeout(1500);
    await loadLive(a, `https://www.youtube.com/watch?v=${VID}`).catch(() => {});
    await a.win.waitForTimeout(2000);
    c = await report(a, "third tab, same video");
    console.log("    shot:", await a.shot("three-tabs-same-video"));
  }

  // --- step 7: give it time; an update loop can take a moment to trip
  if (!c.crashed) {
    await a.win.waitForTimeout(6000);
    c = await report(a, "6s later");
  }

  console.log(`\nVERDICT[${TAG}]: ${worst ? `crashed at "${worst}"` : "never crashed"}`);
  const errs = a.logs.console.filter((l) => /error/i.test(l)).slice(0, 10);
  if (errs.length) console.log("console errors:\n  " + errs.join("\n  ").slice(0, 2000));
  await a.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
