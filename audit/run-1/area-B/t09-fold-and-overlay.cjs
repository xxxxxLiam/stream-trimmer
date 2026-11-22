/**
 * File: t09-fold-and-overlay.cjs
 * Description: (a) where the mark bar and Cut sit once a real clip is being
 *   built (several segments) at each window size, including the app's own
 *   minimum (900x600); (b) whether the preview's "owner blocks playback"
 *   overlay ever covers the Add segment button after a video change.
 */
const { boot, stubRoot } = require("./boot.cjs");
const { live, S, loadLive, markLive } = require("./live.cjs");
const STUB = process.env.STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubB";

const PROBE = `(() => {
  const vis = Array.from(document.querySelectorAll('#ui-mark-in')).find((e) => e.offsetParent !== null);
  if (!vis) return null;
  const pane = vis.closest('div.absolute.inset-0');
  const b = (sel) => { const e = pane.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom) }; };
  const hit = (sel) => {
    const e = pane.querySelector(sel); if (!e) return null;
    const r = e.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return 'OFFSCREEN';
    const t = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return !t ? 'none' : (t === e || e.contains(t) ? 'self' : (t.className || t.tagName).toString().slice(0, 70));
  };
  return { vh: window.innerHeight, markIn: b('#ui-mark-in'), add: b('#ui-add-segment'), cut: b('#ui-cut'),
           hitAdd: hit('#ui-add-segment'), hitCut: hit('#ui-cut'), hitMarkIn: hit('#ui-mark-in') };
})()`;

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: "stub0000001", title: "Fold video", duration: 600, uploader: "Ch" }, transcriptLines: 30, delayMs: 0 });
  const a = await boot({ label: "t09-fold", stub: STUB, viewport: { width: 1440, height: 900 } });
  await loadLive(a, "https://www.youtube.com/watch?v=stub0000001");

  // Build a realistic clip: four segments.
  for (const [i, o] of [["00:00:10", "00:00:20"], ["00:01:00", "00:01:10"], ["00:02:00", "00:02:10"], ["00:03:00", "00:03:10"]]) {
    await markLive(a, i, o);
    try {
      await a.win.click(S.add, { timeout: 8000 });
    } catch (err) {
      console.log("!! Add segment click blocked. geometry:", JSON.stringify(await a.win.evaluate(`(() => {
        const btn = document.querySelector('#ui-add-segment');
        const r = btn.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        const t = document.elementFromPoint(cx, cy);
        const ov = document.querySelector('.aspect-video');
        const orr = ov ? ov.getBoundingClientRect() : null;
        const inner = document.querySelector('.aspect-video .absolute.inset-0.flex.flex-col');
        const ir = inner ? inner.getBoundingClientRect() : null;
        return {
          btn: { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), right: Math.round(r.right) },
          point: [Math.round(cx), Math.round(cy)],
          topElement: t ? (t.id || t.className || t.tagName).toString().slice(0, 120) : null,
          topElementRect: t ? (() => { const q = t.getBoundingClientRect(); return { top: Math.round(q.top), bottom: Math.round(q.bottom), left: Math.round(q.left), right: Math.round(q.right) }; })() : null,
          aspectVideo: orr ? { top: Math.round(orr.top), bottom: Math.round(orr.bottom) } : null,
          innerOverlay: ir ? { top: Math.round(ir.top), bottom: Math.round(ir.bottom), left: Math.round(ir.left), right: Math.round(ir.right) } : null,
          disabled: btn.disabled,
        };
      })()`)));
      console.log("   shot:", await a.shot("add-click-blocked"));
      throw err;
    }
  }
  console.log("segments:", (await live(a)).rows.length);

  for (const s of [[1440, 900], [1280, 800], [1024, 768], [900, 800], [900, 600]]) {
    await a.win.setViewportSize({ width: s[0], height: s[1] });
    await a.win.waitForTimeout(800);
    const p = await a.win.evaluate(PROBE);
    const belowFold = (x) => (x ? x.bottom > p.vh : null);
    console.log(
      `${s[0]}x${s[1]}  markIn.bottom=${p.markIn?.bottom} add.bottom=${p.add?.bottom} cut.bottom=${p.cut?.bottom} vh=${p.vh}` +
        ` | belowFold: markFields=${belowFold(p.markIn)} add=${belowFold(p.add)} cut=${belowFold(p.cut)}` +
        ` | hits: ${p.hitMarkIn}/${p.hitAdd}/${p.hitCut}`,
    );
    console.log("   shot:", await a.shot(`fold-${s[0]}x${s[1]}`));
  }

  // --- overlay interception right after a video change --------------------
  await a.win.setViewportSize({ width: 1440, height: 900 });
  await a.win.waitForTimeout(600);
  console.log("\n=== Add segment hit-test while the video changes ===");
  stub.write({ info: { id: "ddddddddddd", title: "Second video", duration: 600, uploader: "Ch" } });
  await a.win.locator("#ui-source-chip button:has-text('Change')").locator("visible=true").first().click();
  await a.win.locator(S.urlInput).first().fill("https://www.youtube.com/watch?v=ddddddddddd");
  await a.win.keyboard.press("Enter");
  for (let i = 0; i < 14; i++) {
    await a.win.waitForTimeout(500);
    const p = await a.win.evaluate(PROBE);
    console.log(`  t+${(i + 1) * 0.5}s hitAdd=${p?.hitAdd} hitCut=${p?.hitCut} add.top=${p?.add?.top}`);
  }
  console.log("shot:", await a.shot("after-video-change"));
  await a.close();
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
