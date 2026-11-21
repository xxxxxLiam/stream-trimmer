/**
 * File: t08-layout.cjs
 * Description: Layout and accessibility of the clipping loop at 1440x900,
 *   1024x768 and a narrow 900px. Measures where the mark bar, Add segment and
 *   Cut actually sit, whether anything covers them, and keyboard-only marking.
 */
const { boot, stubRoot } = require("./boot.cjs");
const { live, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";

const GEO = `(() => {
  const vis = Array.from(document.querySelectorAll('#ui-mark-in')).find((e) => e.offsetParent !== null);
  const pane = vis ? vis.closest('div.absolute.inset-0') : document;
  const box = (sel) => {
    const e = pane.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right), w: Math.round(r.width), h: Math.round(r.height) };
  };
  // What is actually on top at the centre of an element?
  const hit = (sel) => {
    const e = pane.querySelector(sel);
    if (!e) return null;
    const r = e.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (y < 0 || y > window.innerHeight) return "OFFSCREEN";
    const top = document.elementFromPoint(x, y);
    if (!top) return "none";
    return top === e || e.contains(top) ? "self" : (top.id || top.className || top.tagName).toString().slice(0, 90);
  };
  const col = pane.querySelector('#ui-col-centre');
  return {
    viewport: { w: window.innerWidth, h: window.innerHeight },
    centreColumn: box('#ui-col-centre'),
    centreScroll: col ? { scrollTop: col.scrollTop, scrollHeight: col.scrollHeight, clientHeight: col.clientHeight, scrollable: col.scrollHeight > col.clientHeight + 1 } : null,
    preview: box('.aspect-video'),
    timeline: box('[role="slider"][aria-label="Video timeline"]'),
    markIn: box('#ui-mark-in'),
    addSegment: box('#ui-add-segment'),
    cut: box('#ui-cut'),
    stitched: box('#ui-stitched-total'),
    hitAdd: hit('#ui-add-segment'),
    hitCut: hit('#ui-cut'),
    hitMarkIn: hit('#ui-mark-in'),
    pageScrollable: document.documentElement.scrollHeight > window.innerHeight + 1,
    // Every ancestor that could scroll the centre column into view.
    scrollers: (() => {
      const out = [];
      let n = pane.querySelector('#ui-col-centre');
      while (n && n !== document.body) {
        const cs = getComputedStyle(n);
        if (/(auto|scroll)/.test(cs.overflowY)) {
          out.push({ cls: (n.className || '').toString().slice(0, 60), scrollTop: n.scrollTop, scrollHeight: n.scrollHeight, clientHeight: n.clientHeight, canScroll: n.scrollHeight > n.clientHeight + 1 });
        }
        n = n.parentElement;
      }
      return out;
    })(),
  };
})()`;

const SIZES = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "900x800", width: 900, height: 800 },
  { name: "900x600", width: 900, height: 600 },
];

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "stub0000001", title: "Layout video", duration: 600, uploader: "Ch" }, transcriptLines: 40, delayMs: 0 });
  const a = await boot({ label: "t08-layout", stub: STUB, viewport: { width: 1440, height: 900 } });
  await loadLive(a, "https://www.youtube.com/watch?v=stub0000001");

  for (const s of SIZES) {
    await a.win.setViewportSize({ width: s.width, height: s.height });
    await a.win.waitForTimeout(900);
    const g = await a.win.evaluate(GEO);
    console.log(`\n=== ${s.name} ===`);
    console.log(JSON.stringify(g, null, 1));
    console.log("shot:", await a.shot(`layout-${s.name}`));
    // Is the primary action reachable without scrolling?
    const cutVisible = g.cut && g.cut.bottom <= g.viewport.h && g.cut.top >= 0;
    const markVisible = g.markIn && g.markIn.bottom <= g.viewport.h && g.markIn.top >= 0;
    console.log(`  Cut in viewport: ${cutVisible} | Mark fields in viewport: ${markVisible}`);
    console.log("  scroll ancestors:", JSON.stringify(g.scrollers));
    if (!cutVisible) {
      // Try, as a user would, to scroll it into view.
      const reached = await a.win.evaluate(() => {
        const vis = Array.from(document.querySelectorAll('#ui-mark-in')).find((e) => e.offsetParent !== null);
        const pane = vis.closest('div.absolute.inset-0');
        const cut = pane.querySelector('#ui-cut');
        cut.scrollIntoView({ block: 'center' });
        const r = cut.getBoundingClientRect();
        return { top: Math.round(r.top), bottom: Math.round(r.bottom), vh: window.innerHeight, nowVisible: r.top >= 0 && r.bottom <= window.innerHeight };
      });
      console.log("  after scrollIntoView:", JSON.stringify(reached));
      console.log("  shot:", await a.shot(`layout-${s.name}-scrolled`));
    }
  }

  // --- keyboard-only marking ----------------------------------------------
  await a.win.setViewportSize({ width: 1440, height: 900 });
  await a.win.waitForTimeout(600);
  console.log("\n=== keyboard-only marking ===");
  await a.win.click(S.markIn);
  await a.win.keyboard.type("00:00:30");
  await a.win.keyboard.press("Tab");
  await a.win.keyboard.type("00:01:00");
  console.log("after typing:", JSON.stringify(await live(a)));
  // Cmd/Ctrl+Shift+Enter is the advertised Add segment shortcut
  await a.win.keyboard.press("Control+Shift+Enter");
  await a.win.waitForTimeout(400);
  console.log("after Ctrl+Shift+Enter:", JSON.stringify((await live(a)).rows));
  // Tab order from the mark field to the primary action
  const order = await a.win.evaluate(() => {
    const vis = Array.from(document.querySelectorAll("#ui-mark-in")).find((e) => e.offsetParent !== null);
    const pane = vis.closest("div.absolute.inset-0");
    const foc = Array.from(pane.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])'))
      .filter((e) => e.offsetParent !== null);
    const i = foc.indexOf(vis);
    return foc.slice(i, i + 8).map((e) => (e.id || e.getAttribute("aria-label") || e.innerText || e.tagName).toString().replace(/\s+/g, " ").slice(0, 40));
  });
  console.log("tab order from the In field:", JSON.stringify(order));

  // --- labels / accessible names -------------------------------------------
  console.log("\n=== labels ===");
  console.log(JSON.stringify(await a.win.evaluate(() => {
    const vis = Array.from(document.querySelectorAll("#ui-mark-in")).find((e) => e.offsetParent !== null);
    const pane = vis.closest("div.absolute.inset-0");
    const named = (sel) => {
      const e = pane.querySelector(sel);
      if (!e) return null;
      const lab = e.labels && e.labels[0] ? e.labels[0].innerText.replace(/\s+/g, " ").trim() : null;
      return { id: e.id, ariaLabel: e.getAttribute("aria-label"), label: lab, ariaKeyshortcuts: e.getAttribute("aria-keyshortcuts") };
    };
    return {
      markIn: named("#ui-mark-in"),
      markOut: named("#ui-mark-out"),
      add: named("#ui-add-segment"),
      cut: named("#ui-cut"),
      timelineRole: pane.querySelector('[role="slider"][aria-label="Video timeline"]')?.getAttribute("aria-valuetext"),
      liveRegions: pane.querySelectorAll("[aria-live]").length,
    };
  }), null, 1));
  console.log("shot:", await a.shot("keyboard"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
