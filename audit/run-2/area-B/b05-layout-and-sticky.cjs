/**
 * File: b05-layout-and-sticky.cjs
 * Path: audit/run-2/area-B/b05-layout-and-sticky.cjs
 * Description: B-3 (the preview spilling over the mark bar and swallowing clicks) and
 *   B-10 (the primary action below the fold), re-measured per added segment at five
 *   viewports — plus the thing those two fixes introduced: a STICKY cut row
 *   (`#ui-cut-row`, position:sticky bottom:0, z-10) at the bottom of the scrolling
 *   centre column. Anything the mark bar draws underneath it — the lower segment rows
 *   and the "Already used" overlap warning with its two buttons — is a candidate for
 *   being covered by it, which is the same class of defect as B-3.
 *
 *   Every "COVERED/OK" here is document.elementFromPoint at the control's own centre
 *   plus a real mouse click, not a geometry guess.
 */
const { boot, live, loadLive, markLive, seedBank, stubRoot, S } = require("./lib.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/b2";
const STUB = process.env.STUB || `${SCRATCH}/stub`;
const ROOT = process.env.ROOT || "/home/user/stream-trimmer";
const TAG = process.env.TAG || ROOT.split("/").pop();
const VID = "ddddddddddd";

const PROBE = `(() => {
  const vis = (sel) => Array.from(document.querySelectorAll(sel)).find((e) => e.offsetParent !== null) || null;
  const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), left: Math.round(r.left), w: Math.round(r.width) }; };
  const hit = (el) => {
    if (!el) return "missing";
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return "zero-size";
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (y < 0 || y > innerHeight || x < 0 || x > innerWidth) return "OFFSCREEN";
    const top = document.elementFromPoint(x, y);
    if (!top) return "none";
    if (el.contains(top) || top === el || top.contains(el)) return "OK";
    const id = top.id ? "#" + top.id : "";
    return "COVERED by " + top.tagName + id + " [" + (top.className || "").toString().slice(0, 60) + "]";
  };
  const add = vis("#ui-add-segment"), cut = vis("#ui-cut"), mi = vis("#ui-mark-in"), row = vis("#ui-cut-row");
  const rows = Array.from(document.querySelectorAll('ol[aria-label^="Segments"] > li')).filter((li) => li.offsetParent !== null);
  const lastRow = rows[rows.length - 1] || null;
  const lastX = lastRow ? lastRow.querySelector('button[aria-label^="Remove"],button[title^="Remove"],button') : null;
  const warn = vis("#ui-overlap-warning");
  const warnBtn = warn ? Array.from(warn.querySelectorAll("button")).pop() : null;
  const preview = vis("#ui-col-centre .aspect-video") || vis(".aspect-video");
  return {
    segments: rows.length,
    boxes: { add: box(add), cut: box(cut), markIn: box(mi), cutRow: box(row), aspect: box(preview), lastRow: box(lastRow) },
    hits: { add: hit(add), cut: hit(cut), markIn: hit(mi), lastRowX: hit(lastX), overlapBtn: hit(warnBtn) },
    cutRowSticky: row ? getComputedStyle(row).position : null,
    overlapWarning: warn ? warn.innerText.replace(/\\s+/g, " ").slice(0, 120) : null,
    centreScroll: (() => { const c = document.querySelector("#ui-col-centre"); return c ? { scrollTop: c.scrollTop, scrollHeight: c.scrollHeight, clientHeight: c.clientHeight } : null; })(),
    viewport: { w: innerWidth, h: innerHeight },
  };
})()`;

/** Remove every segment row, so each viewport starts from zero. */
async function clearSegments(a) {
  for (let i = 0; i < 40; i++) {
    const n = await a.win.locator('button[aria-label^="Remove segment"]').count();
    if (n === 0) break;
    await a.win
      .locator('button[aria-label^="Remove segment"]')
      .first()
      .click({ timeout: 2000, force: true })
      .catch(() => {});
    await a.win.waitForTimeout(60);
  }
  const left = await a.win.locator('ol[aria-label^="Segments"] > li').count();
  if (left) console.log(`    (warning: ${left} segment rows would not clear)`);
  await a.win.waitForTimeout(200);
}

async function probe(a) {
  return a.win.evaluate(PROBE);
}

/** A real mouse click, reported honestly when it lands on something else. */
async function realClick(a, sel) {
  try {
    await a.win.locator(sel).first().click({ timeout: 2500 });
    return "clicked";
  } catch (e) {
    return "REFUSED: " + String(e).split("\n")[0].slice(0, 120);
  }
}

(async () => {
  console.log(`=== B-3 / B-10 / sticky cut row ===\nROOT=${ROOT}  TAG=${TAG}`);
  const stub = stubRoot(STUB);
  stub.write({ info: { id: VID, title: "Layout video", duration: 600, uploader: "Ch" }, transcriptLines: 10 });

  // A campaign with a used range so the overlap warning can be made to appear.
  const seed = seedBank({ videoId: VID, rows: [] });
  seed["clipper.campaigns"][0].usedRanges = { [VID]: [{ start: 100, end: 160, clipId: "C-used-01" }] };

  const a = await boot({ label: `b05-${TAG}`, root: ROOT, stub: STUB, viewport: { width: 1440, height: 900 }, seed });
  await loadLive(a, `https://www.youtube.com/watch?v=${VID}`);

  const VIEWPORTS = [
    [1440, 900],
    [1280, 800],
    [1100, 760],
    [1024, 768],
    [900, 600],
  ];
  const MARKS = [
    ["00:00:10", "00:00:20"],
    ["00:00:30", "00:00:40"],
    ["00:00:50", "00:01:00"],
    ["00:02:50", "00:03:00"],
    ["00:03:10", "00:03:20"],
  ];

  for (const [w, h] of VIEWPORTS) {
    await a.win.setViewportSize({ width: w, height: h });
    await a.win.waitForTimeout(500);
    console.log(`\n--- ${w}x${h} ---`);
    // 0 segments
    let p = await probe(a);
    console.log(
      `  0 seg: cutRow=${p.cutRowSticky} add=${p.hits.add} markIn=${p.hits.markIn} cut=${p.hits.cut} ` +
        `aspect=${JSON.stringify(p.boxes.aspect)} cut=${JSON.stringify(p.boxes.cut)}`,
    );
    for (let i = 0; i < MARKS.length; i++) {
      await markLive(a, MARKS[i][0], MARKS[i][1]).catch(() => {});
      const click = await realClick(a, S.add);
      await a.win.waitForTimeout(250);
      p = await probe(a);
      console.log(
        `  ${i + 1} seg: addClick=${click} | add=${p.hits.add} markIn=${p.hits.markIn} cut=${p.hits.cut} ` +
          `lastRowX=${p.hits.lastRowX} | cutRow=${JSON.stringify(p.boxes.cutRow)} lastRow=${JSON.stringify(p.boxes.lastRow)} ` +
          `centre=${JSON.stringify(p.centreScroll)}`,
      );
    }
    console.log("  shot:", await a.shot(`${w}x${h}-five-segments`));
    await clearSegments(a);
  }

  // --- the overlap warning under the sticky row
  console.log("\n--- overlap warning ('Already used') with a full segment list ---");
  await a.win.setViewportSize({ width: 1100, height: 760 });
  await a.win.waitForTimeout(400);
  for (const [i, o] of MARKS.slice(0, 4)) {
    await markLive(a, i, o).catch(() => {});
    await a.win.click(S.add, { timeout: 3000 }).catch(() => {});
  }
  // 00:01:50-00:02:00 does not overlap; 00:01:45-00:02:05 does (used 100-160).
  await markLive(a, "00:01:45", "00:02:05").catch(() => {});
  await a.win.click(S.add, { timeout: 3000 }).catch(() => {});
  await a.win.waitForTimeout(600);
  let p = await probe(a);
  console.log("  warning:", JSON.stringify(p.overlapWarning));
  console.log("  hits:", JSON.stringify(p.hits));
  console.log("  boxes:", JSON.stringify(p.boxes));
  console.log("  centre scroll:", JSON.stringify(p.centreScroll));
  console.log("  pane:", JSON.stringify(await live(a)));
  console.log("  shot:", await a.shot("overlap-warning-with-sticky-row"));
  // Can the user actually press "Use it anyway"?
  const anyway = await realClick(a, '#ui-overlap-warning button:has-text("anyway")');
  console.log("  click 'Use it anyway':", anyway);
  console.log("  after:", JSON.stringify((await probe(a)).hits));
  console.log("  shot:", await a.shot("after-use-it-anyway"));

  // --- with the help drawer open the columns are measured without it (T3's container query)
  console.log("\n--- help drawer open at 1100x760, ONE segment, clean ---");
  await clearSegments(a);
  await markLive(a, "00:00:10", "00:00:20").catch(() => {});
  await a.win.click(S.add, { timeout: 3000 }).catch(() => {});
  await a.win.waitForTimeout(400);
  console.log("  before opening the drawer:", JSON.stringify((await probe(a)).hits));
  await a.win.keyboard.press("Control+/");
  await a.win.waitForTimeout(700);
  p = await probe(a);
  console.log("  hits:", JSON.stringify(p.hits), "cutRow:", JSON.stringify(p.boxes.cutRow));
  console.log("  shot:", await a.shot("help-drawer-open"));
  await a.close();
})().catch((e) => {
  console.error("SCRIPT FAILED", e);
  process.exit(1);
});
