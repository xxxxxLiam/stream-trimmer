/**
 * File: v2-layout.cjs
 * Path: audit/run-2/area-B/v2-layout.cjs
 * Description: Re-runs run 1's B-3 (the preview spilling over In/Out/Add from the second
 *   segment on) and B-10 (the primary action below the fold) against the fixed layout, and
 *   attacks what the fix is near: the container query, the new sticky Cut row, and the help
 *   drawer that is measured as a sibling. For each viewport and segment count it
 *   hit-tests the real controls with elementFromPoint AND with a real mouse click.
 *   Audit-only.
 *
 *   Usage: xvfb-run -a node v2-layout.cjs
 */
const { boot, stubRoot, loadLive, markLive, S, SP } = require("./lib.cjs");

const STUB = `${SP}/stubB2`;
const log = (...x) => console.log("[v2]", ...x);
const VID = "layout00001";

const PROBE = `(() => {
  const vis = (sel) => Array.from(document.querySelectorAll(sel)).find((e) => e.offsetParent !== null);
  const box = (e) => { if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width) }; };
  const hit = (e) => {
    if (!e) return "MISSING";
    const r = e.getBoundingClientRect();
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) return "OFFSCREEN";
    const top = document.elementFromPoint(x, y);
    if (!top) return "NOTHING";
    return (top === e || e.contains(top) || top.contains(e)) ? "OK" : "COVERED:" + (top.className || top.tagName).toString().slice(0, 60);
  };
  const add = vis("#ui-add-segment"), cut = vis("#ui-cut"), mi = vis("#ui-mark-in"), cutRow = vis("#ui-cut-row");
  const centre = vis("#ui-col-centre"), transcript = vis("#ui-col-transcript"), clips = vis("#ui-col-clips");
  return {
    viewport: [innerWidth, innerHeight],
    columns: { transcript: box(transcript)?.w, centre: box(centre)?.w, clips: box(clips)?.w },
    threeColumns: transcript && clips ? Math.abs(box(transcript).top - box(clips).top) < 4 : null,
    preview: box(vis(".aspect-video")),
    addBox: box(add), addHit: hit(add),
    inBox: box(mi), inHit: hit(mi),
    cutBox: box(cut), cutHit: hit(cut),
    cutRow: box(cutRow),
    docScrollW: document.documentElement.scrollWidth,
    visibleScrollbars: Array.from(document.querySelectorAll("*")).filter((e) => e.scrollHeight > e.clientHeight + 1 && e.offsetWidth - e.clientWidth > 0).length,
  };
})()`;

(async () => {
  const stub = stubRoot(STUB);
  stub.write({ info: { id: VID, title: "Layout video", duration: 600, uploader: "Ch" }, transcriptLines: 30 });
  const a = await boot({ tree: "head", label: "v2-layout", stub: STUB });

  const probe = () => a.win.evaluate(PROBE);
  const addSeg = async (i) => {
    await markLive(a, `00:0${i}:00`, `00:0${i}:10`);
    await a.win.click(S.add).catch((e) => log("  click Add FAILED:", String(e.message).slice(0, 90)));
    await a.win.waitForTimeout(250);
  };

  try {
    // native default first: electron/main.cjs opens at 1100x760, minimum 900x600
    for (const [w, h] of [[1100, 760], [1440, 900], [1280, 800], [1024, 768], [900, 600]]) {
      await a.win.setViewportSize({ width: w, height: h });
      await a.win.waitForTimeout(400);
      if (!(await a.win.locator("#ui-source-chip").count()) || !(await a.win.locator(S.urlInput).count())) {
        // already loaded from a previous viewport pass
      }
      if (!(await a.win.locator('#ui-source-chip:has-text("Layout video")').count())) {
        await loadLive(a, `https://www.youtube.com/watch?v=${VID}`);
      }
      // clear any segments from the previous pass by reloading the window
      log(`\n=== ${w}x${h} ===`);
      for (let n = 0; n <= 5; n++) {
        if (n > 0) await addSeg(n);
        const p = await probe();
        log(` ${n} seg:`, JSON.stringify(p));
      }
      log(" shot:", await a.shot(`${w}x${h}-5seg`));
      // reset: reload the renderer so the next viewport starts from zero segments
      await a.win.reload();
      await a.win.waitForLoadState("domcontentloaded");
      await a.win.waitForFunction(() => document.querySelectorAll("#ui-mark-in").length > 0, null, { timeout: 30000 });
      await a.win
        .waitForFunction(() => !document.querySelector("div.fixed.inset-0.z-50"), null, { timeout: 20000 })
        .catch(() => {});
    }

    // --- the help drawer: a 400px sibling. Does the centre column survive it? ---
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await loadLive(a, `https://www.youtube.com/watch?v=${VID}`);
    for (let n = 1; n <= 3; n++) await addSeg(n);
    log("\n=== 1440x900, 3 segments, drawer CLOSED ===");
    log(JSON.stringify(await probe()));
    await a.win.keyboard.press("Control+/");
    await a.win.waitForTimeout(700);
    log("=== drawer OPEN ===");
    log(JSON.stringify(await probe()));
    log(" shot:", await a.shot("drawer-open"));
    await a.win.keyboard.press("Control+/");
    await a.win.waitForTimeout(500);

    // --- 1100x760 with the drawer open: the area drops to 700px, under the 960 query ---
    await a.win.setViewportSize({ width: 1100, height: 760 });
    await a.win.waitForTimeout(400);
    await a.win.keyboard.press("Control+/");
    await a.win.waitForTimeout(700);
    log("\n=== 1100x760, drawer OPEN (area < 960 -> wrapped) ===");
    log(JSON.stringify(await probe()));
    log(" shot:", await a.shot("1100-drawer-open"));

    // --- a real mouse click on Add and on Cut, the thing run 1 found swallowed ---
    await a.win.keyboard.press("Control+/");
    await a.win.waitForTimeout(500);
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(400);
    log("\n=== real mouse clicks with 5 segments at 1440x900 ===");
    for (let n = 4; n <= 6; n++) await addSeg(n);
    const rows = await a.win.locator('ol[aria-label^="Segments"] > li').count();
    log(" rows now:", rows);
    const r = await a.win.evaluate(() => {
      const e = Array.from(document.querySelectorAll("#ui-add-segment")).find((x) => x.offsetParent !== null);
      const b = e.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    await markLive(a, "00:07:00", "00:07:10");
    await a.win.mouse.click(r.x, r.y);
    await a.win.waitForTimeout
      ? await a.win.waitForTimeout(500) : null;
    log(" rows after a bare mouse click at Add's centre:", await a.win.locator('ol[aria-label^="Segments"] > li').count(), "(expect", rows + 1, ")");
    log(" shot:", await a.shot("mouse-click-add"));
  } catch (e) {
    log("SCRIPT ERROR", e && e.message);
    await a.shot("error").catch(() => {});
  }
  await a.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
