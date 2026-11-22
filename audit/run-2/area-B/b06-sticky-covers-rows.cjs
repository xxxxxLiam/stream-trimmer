/**
 * File: b06-sticky-covers-rows.cjs
 * Path: audit/run-2/area-B/b06-sticky-covers-rows.cjs
 * Description: Follow-up to b05. The sticky cut row (`#ui-cut-row`, added to keep Cut on
 *   screen) is opaque and sits above the mark bar's own content at z-10. This asks the only
 *   questions that matter for a user:
 *
 *     - at the app's DEFAULT window (1100x760) with one segment, is the segment row drawn
 *       behind it, and does a REAL mouse click at the row's own coordinates reach the row?
 *     - how much of the segment list is behind it at each segment count?
 *     - does opening the help drawer (Cmd+/) at the default window put In / Out / Add / Cut
 *       off screen?
 *
 *   Real mouse clicks are page.mouse.click at measured coordinates — Playwright's
 *   locator.click() scrolls the target into view first, which hides exactly this defect.
 */
const { boot, live, loadLive, markLive, stubRoot, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
const VID = "eeeeeeeeeee";

const GEO = `(() => {
  const rows = Array.from(document.querySelectorAll('ol[aria-label^="Segments"] > li')).filter((li) => li.offsetParent !== null);
  const cutRow = Array.from(document.querySelectorAll("#ui-cut-row")).find((e) => e.offsetParent !== null) || null;
  const cr = cutRow ? cutRow.getBoundingClientRect() : null;
  const style = cutRow ? getComputedStyle(cutRow) : null;
  const out = rows.map((li, i) => {
    const r = li.getBoundingClientRect();
    const x = li.querySelector('button[aria-label^="Remove segment"]');
    const xr = x ? x.getBoundingClientRect() : null;
    const centre = xr ? document.elementFromPoint(xr.left + xr.width / 2, xr.top + xr.height / 2) : null;
    const hiddenPx = cr ? Math.max(0, Math.min(r.bottom, cr.bottom) - Math.max(r.top, cr.top)) : 0;
    return {
      i: i + 1,
      row: [Math.round(r.top), Math.round(r.bottom)],
      removeX: xr ? [Math.round(xr.left + xr.width / 2), Math.round(xr.top + xr.height / 2)] : null,
      behindCutRowPx: Math.round(hiddenPx),
      topElementAtX: centre ? centre.tagName + (centre.id ? "#" + centre.id : "") + "." + String(centre.className).slice(0, 40) : null,
    };
  });
  return {
    cutRow: cr ? { top: Math.round(cr.top), bottom: Math.round(cr.bottom), position: style.position, zIndex: style.zIndex, background: style.backgroundColor } : null,
    rows: out,
    scroll: (() => { const c = document.querySelector("#ui-col-centre"); return c ? { scrollTop: c.scrollTop, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight } : null; })(),
    docScrollW: document.documentElement.scrollWidth,
    viewport: { w: innerWidth, h: innerHeight },
  };
})()`;

(async () => {
  console.log(`=== sticky cut row vs the segment list ===\nROOT=${ROOT}  TAG=${TAG}`);
  const stub = stubRoot(STUB);
  stub.write({ info: { id: VID, title: "Sticky video", duration: 600, uploader: "Ch" }, transcriptLines: 10 });
  const a = await boot({ label: `b06-${TAG}`, root: ROOT, stub: STUB, viewport: { width: 1100, height: 760 } });
  await loadLive(a, `https://www.youtube.com/watch?v=${VID}`);
  console.log("viewport 1100x760 = the app's own default window size (electron/main.cjs)");

  const MARKS = [
    ["00:00:10", "00:00:20"],
    ["00:00:30", "00:00:40"],
    ["00:00:50", "00:01:00"],
    ["00:02:00", "00:02:10"],
  ];

  for (let n = 0; n < MARKS.length; n++) {
    await markLive(a, MARKS[n][0], MARKS[n][1]);
    await a.win.click(S.add);
    await a.win.waitForTimeout(350);
    const g = await a.win.evaluate(GEO);
    console.log(`\n${n + 1} segment(s): cutRow=${JSON.stringify(g.cutRow)} scroll=${JSON.stringify(g.scroll)}`);
    for (const r of g.rows) {
      console.log(
        `   row ${r.i}: box=${JSON.stringify(r.row)} removeX_at=${JSON.stringify(r.removeX)} ` +
          `behindCutRow=${r.behindCutRowPx}px topElementThere=${r.topElementAtX}`,
      );
    }
  }
  console.log("\nshot (4 segments at the default window):", await a.shot("default-window-4-segments"));

  // A real mouse click at segment 1's remove button, where it is drawn.
  const g = await a.win.evaluate(GEO);
  const target = g.rows[0];
  const rowsBefore = (await live(a)).rows.length;
  if (target.removeX) {
    console.log(`\nreal mouse click at segment 1's x: (${target.removeX[0]}, ${target.removeX[1]})`);
    await a.win.mouse.click(target.removeX[0], target.removeX[1]);
    await a.win.waitForTimeout(600);
    const rowsAfter = (await live(a)).rows.length;
    console.log(`  segment rows ${rowsBefore} -> ${rowsAfter}: ${rowsAfter < rowsBefore ? "the click reached the row" : "*** THE CLICK DID NOT REACH THE ROW ***"}`);
    console.log("  shot:", await a.shot("after-real-mouse-click-on-remove"));
  }

  // Does Playwright's own (scrolling) click see it as blocked?
  const pw = await a.win
    .locator('button[aria-label^="Remove segment"]')
    .first()
    .click({ timeout: 2500, noWaitAfter: true })
    .then(() => "clicked after auto-scroll")
    .catch((e) => "REFUSED: " + String(e).split("\n")[0].slice(0, 110));
  console.log("  Playwright click (auto-scrolls first):", pw);

  // --- the help drawer at the default window
  console.log("\n--- help drawer (Cmd+/) at 1100x760 ---");
  const hit = `(() => {
    const vis = (sel) => Array.from(document.querySelectorAll(sel)).find((e) => e.offsetParent !== null) || null;
    const h = (el) => { if (!el) return "missing"; const r = el.getBoundingClientRect();
      if (r.bottom < 0 || r.top > innerHeight) return "OFFSCREEN (" + Math.round(r.top) + ")";
      const t = document.elementFromPoint(r.left + r.width/2, r.top + r.height/2);
      return t && (el.contains(t) || t === el) ? "OK" : "COVERED"; };
    return {
      markIn: h(vis("#ui-mark-in")), add: h(vis("#ui-add-segment")), cut: h(vis("#ui-cut")),
      transcriptSearch: h(vis('input[placeholder="Find what was said"]')),
      drawerOpen: Boolean(document.querySelector('[aria-label="Help"],[role="complementary"]')) || /Guided/i.test(document.body.innerText),
      docScrollW: document.documentElement.scrollWidth, vw: innerWidth,
      colsHostWidth: document.querySelector(".cols-host")?.clientWidth ?? null,
      wrapped: getComputedStyle(document.querySelector(".cols-row")).flexWrap,
    };
  })()`;
  console.log("  before:", JSON.stringify(await a.win.evaluate(hit)));
  await a.win.keyboard.press("Control+/");
  await a.win.waitForTimeout(900);
  console.log("  after :", JSON.stringify(await a.win.evaluate(hit)));
  console.log("  shot:", await a.shot("help-drawer-open-default-window"));
  await a.win.keyboard.press("Control+/");
  await a.win.waitForTimeout(700);
  console.log("  closed again:", JSON.stringify(await a.win.evaluate(hit)));
  await a.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
