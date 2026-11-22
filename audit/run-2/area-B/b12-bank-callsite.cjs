/**
 * File: b12-bank-callsite.cjs
 * Path: audit/run-2/area-B/b12-bank-callsite.cjs
 * Description: What the ClipsColumn call-site change (setBankedRanges -> seg.setBanked)
 *   is actually worth. b01 showed that reverting it does NOT reproduce C-1's crash — the
 *   per-tab store does that on its own. This asks the other question: with the call site
 *   reverted, does a HIDDEN tab's bank plan get written onto the tab that is on screen?
 *
 *   Tab 1 shows video AAA, which has two banked rows. Tab 2 shows video BBB, which has
 *   none. Correct: only AAA's timeline carries the two "Banked:" spans.
 *
 * Usage: ROOT=<scratch>/ctrlB ... then ROOT=/home/user/stream-trimmer
 */
const { boot, crashState, loadLive, seedBank, stubRoot, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub2`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();

const SPANS = `(() => Array.from(document.querySelectorAll('#ui-mark-in')).map((el, i) => {
  const pane = el.closest('div.absolute.inset-0');
  return {
    i, shown: el.offsetParent !== null,
    source: (pane?.querySelector('#ui-source-chip')?.innerText || '').replace(/\\s+/g,' ').trim(),
    banked: Array.from(pane?.querySelectorAll('[title^="Banked"]') ?? []).map((e) => e.getAttribute('title')),
  };
}))()`;

(async () => {
  console.log(`=== bank plan per tab ===\nROOT=${ROOT}  TAG=${TAG}`);
  const stub = stubRoot(STUB);
  stub.write({
    info: { id: "aaaaaaaaaaa", title: "Video AAA", duration: 30, uploader: "Ch" },
    transcriptLines: 8,
    infoFromUrl: true,
    titles: { aaaaaaaaaaa: "Video AAA", bbbbbbbbbbb: "Video BBB" },
    delayMs: 0,
  });
  const a = await boot({
    label: `b12-${TAG}`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: seedBank({
      videoId: "aaaaaaaaaaa",
      rows: [
        { id: "A01", label: "hook", segments: [{ start: 2, end: 6 }], status: "banked" },
        { id: "A02", label: "payoff", segments: [{ start: 12, end: 16 }], status: "banked" },
      ],
    }),
  });

  await loadLive(a, "https://www.youtube.com/watch?v=aaaaaaaaaaa");
  console.log("tab 1 (AAA) alone:", JSON.stringify(await a.win.evaluate(SPANS)));

  await a.win.click(S.newTab);
  await a.win.waitForTimeout(1200);
  await loadLive(a, "https://www.youtube.com/watch?v=bbbbbbbbbbb");
  await a.win.waitForTimeout(1500);
  console.log("tab 2 (BBB) active, tab 1 hidden:", JSON.stringify(await a.win.evaluate(SPANS), null, 1));
  console.log("shot:", await a.shot("bbb-active"));

  const tabs = await a.win.locator(S.wsTabs).all();
  await tabs[0].click();
  await a.win.waitForTimeout(1200);
  console.log("back on tab 1 (AAA):", JSON.stringify(await a.win.evaluate(SPANS), null, 1));
  console.log("shot:", await a.shot("aaa-active"));
  console.log("crash:", JSON.stringify(await crashState(a)));
  const persisted = a.readState()["clipper.workspaces"];
  await a.close();

  // Phase 2: both tabs RESTORED at mount, with the BBB tab active. Now both ClipsColumns
  // publish their plan during the same first commit, which is the order that decides
  // whether a hidden tab writes into the tab on screen.
  console.log("\n=== phase 2: relaunch with both tabs restored, BBB active ===");
  const tabsSeed = {
    tabs: [
      { id: "ws_aaa", name: "", url: "https://www.youtube.com/watch?v=aaaaaaaaaaa" },
      { id: "ws_bbb", name: "", url: "https://www.youtube.com/watch?v=bbbbbbbbbbb" },
    ],
    activeId: "ws_bbb",
  };
  console.log("(the tab record the first phase left behind was:", JSON.stringify(persisted), ")");
  const b = await boot({
    label: `b12-${TAG}-restored`,
    root: ROOT,
    stub: STUB,
    viewport: { width: 1440, height: 900 },
    seed: { ...seedBank({
      videoId: "aaaaaaaaaaa",
      rows: [
        { id: "A01", label: "hook", segments: [{ start: 2, end: 6 }], status: "banked" },
        { id: "A02", label: "payoff", segments: [{ start: 12, end: 16 }], status: "banked" },
      ],
    }), "clipper.workspaces": tabsSeed },
  });
  await b.win.waitForTimeout(5000);
  console.log("after relaunch (BBB on screen):", JSON.stringify(await b.win.evaluate(SPANS), null, 1));
  console.log("  BBB must carry NO banked span: a span there is AAA's plan painted on the wrong video");
  console.log("shot:", await b.shot("restored-bbb-active"));
  console.log("crash:", JSON.stringify(await crashState(b)));
  await b.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
