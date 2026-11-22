/**
 * File: t11-overflow-per-segment.cjs
 * Description: Add segments one at a time and measure, after each, whether the
 *   video preview box has grown over the timeline / the mark bar and swallowed
 *   their clicks. The preview is `aspect-video` inside a `flex-1` panel, so the
 *   taller the segment list gets, the further the preview overflows its own box.
 */
const { boot, stubRoot } = require("./boot.cjs");
const { S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";

const M = `(() => {
  const q = (s) => document.querySelector(s);
  const box = (s) => { const e = q(s); if (!e) return null; const r = e.getBoundingClientRect(); return [Math.round(r.top), Math.round(r.bottom)]; };
  const hit = (s) => {
    const e = q(s); if (!e) return null;
    const r = e.getBoundingClientRect();
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !t ? 'none' : (t === e || e.contains(t) ? 'OK' : 'COVERED');
  };
  const pv = q('.aspect-video');
  const panel = pv ? pv.parentElement.parentElement : null;
  return {
    segs: document.querySelectorAll('ol[aria-label^="Segments"] > li').length,
    previewPanel: panel ? [Math.round(panel.getBoundingClientRect().top), Math.round(panel.getBoundingClientRect().bottom)] : null,
    aspectBottom: box('.aspect-video') ? box('.aspect-video')[1] : null,
    timeline: box('[role="slider"][aria-label="Video timeline"]'),
    markIn: box('#ui-mark-in'),
    add: box('#ui-add-segment'),
    cut: box('#ui-cut'),
    hit: { timeline: hit('[role="slider"][aria-label="Video timeline"]'), markIn: hit('#ui-mark-in'), add: hit('#ui-add-segment'), cut: hit('#ui-cut') },
  };
})()`;

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "stub0000001", title: "Overflow video", duration: 600, uploader: "Ch" }, transcriptLines: 20, delayMs: 0 });

  for (const [w, h] of [[1440, 900], [1024, 768]]) {
    console.log(`\n######## ${w}x${h} ########`);
    const a = await boot({ label: `t11-${w}x${h}`, stub: STUB, viewport: { width: w, height: h } });
    await loadLive(a, "https://www.youtube.com/watch?v=stub0000001");
    await a.win.waitForTimeout(800);
    console.log("0 segments:", JSON.stringify(await a.win.evaluate(M)));

    for (let n = 1; n <= 5; n++) {
      await markLive(a, `00:0${n}:00`, `00:0${n}:10`);
      await a.win.waitForTimeout(250);
      let clicked = "mouse";
      try {
        await a.win.click(S.add, { timeout: 4000 });
      } catch {
        clicked = "MOUSE CLICK REFUSED — fell back to the keyboard shortcut";
        await a.win.keyboard.press("Control+Shift+Enter");
      }
      await a.win.waitForTimeout(500);
      const m = await a.win.evaluate(M);
      console.log(`after add #${n} (${clicked}):`, JSON.stringify(m));
      if (clicked !== "mouse") console.log("   shot:", await a.shot(`refused-at-${n}`));
    }
    console.log("shot:", await a.shot("five-segments"));
    await a.close();
  }
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
