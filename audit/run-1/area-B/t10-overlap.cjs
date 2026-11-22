/**
 * File: t10-overlap.cjs
 * Description: Pins down when the video preview box overlaps the timeline and
 *   the mark bar and swallows clicks on "Add segment".
 */
const { boot, stubRoot } = require("./boot.cjs");
const { S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";

const M = `(() => {
  const r = (sel) => { const e = document.querySelector(sel); if (!e) return null; const q = e.getBoundingClientRect(); return [Math.round(q.top), Math.round(q.bottom)]; };
  const hit = (sel) => {
    const e = document.querySelector(sel); if (!e) return null;
    const q = e.getBoundingClientRect();
    const t = document.elementFromPoint(q.left + q.width / 2, q.top + q.height / 2);
    return !t ? 'none' : (t === e || e.contains(t) ? 'self' : 'COVERED by ' + (t.className || t.tagName).toString().slice(0, 50));
  };
  const col = document.querySelector('#ui-col-centre');
  const pv = document.querySelector('.aspect-video');
  const prev = pv ? pv.closest('.flex.min-h-0.min-w-0.flex-1.flex-col') : null;
  return {
    col: col ? { top: Math.round(col.getBoundingClientRect().top), h: Math.round(col.clientHeight), scrollH: col.scrollHeight, scrollTop: col.scrollTop } : null,
    previewPanelBox: prev ? [Math.round(prev.getBoundingClientRect().top), Math.round(prev.getBoundingClientRect().bottom)] : null,
    previewPanelScrollH: prev ? prev.scrollHeight : null,
    aspect: r('.aspect-video'),
    timeline: r('[role="slider"][aria-label="Video timeline"]'),
    markIn: r('#ui-mark-in'),
    add: r('#ui-add-segment'),
    cut: r('#ui-cut'),
    hitTimeline: hit('[role="slider"][aria-label="Video timeline"]'),
    hitAdd: hit('#ui-add-segment'),
    hitCut: hit('#ui-cut'),
    hitMarkIn: hit('#ui-mark-in'),
  };
})()`;

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "stub0000001", title: "Overlap video", duration: 600, uploader: "Ch" }, transcriptLines: 30, delayMs: 0 });
  const a = await boot({ label: "t10-overlap", stub: STUB, viewport: { width: 1440, height: 900 } });

  const step = async (what) => console.log(`${what.padEnd(34)} ${JSON.stringify(await a.win.evaluate(M))}`);

  await step("before any video");
  await loadLive(a, "https://www.youtube.com/watch?v=stub0000001");
  await step("after loading the video");
  await a.win.waitForTimeout(1500);
  await step("1.5s later");
  await a.win.fill(S.markIn, "00:00:10");
  await a.win.waitForTimeout(400);
  await step("after typing In");
  await a.win.fill(S.markOut, "00:00:20");
  await a.win.waitForTimeout(600);
  await step("after typing Out");
  console.log("shot:", await a.shot("marked"));

  // Scroll the centre column, as clicking anything lower would.
  await a.win.evaluate(() => { document.querySelector("#ui-col-centre").scrollTop = 120; });
  await a.win.waitForTimeout(400);
  await step("after scrolling the column 120px");
  console.log("shot:", await a.shot("scrolled-120"));

  await a.win.evaluate(() => { document.querySelector("#ui-col-centre").scrollTop = 1000; });
  await a.win.waitForTimeout(400);
  await step("after scrolling to the bottom");
  console.log("shot:", await a.shot("scrolled-bottom"));

  // Can a user still press Add segment from the keyboard?
  await a.win.evaluate(() => { document.querySelector("#ui-col-centre").scrollTop = 120; });
  await a.win.waitForTimeout(300);
  await a.win.keyboard.press("Control+Shift+Enter");
  await a.win.waitForTimeout(500);
  console.log("segments after the keyboard shortcut:", await a.win.locator('ol[aria-label^="Segments"] > li').count());
  console.log("shot:", await a.shot("after-keyboard-add"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
