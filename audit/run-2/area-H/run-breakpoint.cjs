/**
 * File: run-breakpoint.cjs
 * Path: audit/run-2/area-H/run-breakpoint.cjs
 * Description: Verifies T3's container-query fix for H-3 / H-4 / B-10 and
 *   T10's sticky Cut row in one pass. Reads the window's real default and
 *   minimum out of the live main process, sweeps the real Electron window width
 *   across 940..1200 at both heights, measures the three-column layout state and
 *   every critical control's position, and hit-tests whether the sticky row
 *   covers anything — with 0, 2 and 5 segments. Audit-only; no product code is
 *   touched.
 *
 *   Coverage is hit-tested with elementFromPoint at nine points across each
 *   control's box: a rect comparison cannot see z-order, so it cannot answer
 *   "is it covered".
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

const CRITICAL = [
  ["#ui-mark-in", "In field"],
  ["#ui-mark-out", "Out field"],
  ["#ui-mark-whole", "Whole video"],
  ["#ui-add-segment", "Add segment"],
  ["#ui-cut", "Cut"],
  ["#ui-stitched-total", "Stitched total"],
  ["#ui-col-transcript", "Transcript col"],
  ["#ui-col-centre", "Centre col"],
  ["#ui-col-clips", "Clips col"],
  ["#ui-source-chip", "URL bar"],
  ["#ui-help-button", "Help button"],
  ["#ui-timeline", "Timeline"],
  ["#ui-segment-list", "Segment list"],
];

const MEASURE = (targets) => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const row = document.querySelector(".cols-row");
  const host = document.querySelector(".cols-host");
  const cutRow = document.getElementById("ui-cut-row");
  const rectOf = (el) => { const r = el.getBoundingClientRect();
    return { t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height), w: Math.round(r.width) }; };
  const out = {
    vw, vh,
    wrapped: row ? getComputedStyle(row).flexWrap !== "nowrap" : null,
    hostWidth: host ? Math.round(host.getBoundingClientRect().width) : null,
    colWidths: [...document.querySelectorAll("#ui-col-transcript,#ui-col-centre,#ui-col-clips")]
      .map((e) => Math.round(e.getBoundingClientRect().width)),
    centreOverflowY: document.querySelector(".cols-centre")
      ? getComputedStyle(document.querySelector(".cols-centre")).overflowY : null,
    cutRowPosition: cutRow ? getComputedStyle(cutRow).position : null,
    cutRowRect: cutRow ? rectOf(cutRow) : null,
    docScrollWidth: document.documentElement.scrollWidth,
    hScroll: document.documentElement.scrollWidth > vw + 1,
    gateUp: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
    items: [],
  };
  for (const [sel, name] of targets) {
    const el = document.querySelector(sel);
    if (!el) { out.items.push({ name, sel, missing: true }); continue; }
    const r = el.getBoundingClientRect();
    const pts = [];
    for (const fx of [0.15, 0.5, 0.85]) {
      for (const fy of [0.2, 0.5, 0.8]) {
        const x = r.left + r.width * fx, y = r.top + r.height * fy;
        if (x < 0 || y < 0 || x > vw || y > vh) { pts.push("OFFSCREEN"); continue; }
        const hit = document.elementFromPoint(x, y);
        if (!hit) { pts.push("NONE"); continue; }
        if (hit === el || el.contains(hit) || hit.contains(el)) { pts.push("OK"); continue; }
        const id = hit.id ? "#" + hit.id : hit.tagName.toLowerCase() +
          "." + String(hit.className || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".");
        // Name the nearest identifiable ancestor too, so "covered by" is useful.
        const anc = hit.closest("[id]");
        pts.push("COVERED:" + id + (anc && anc.id ? "(in #" + anc.id + ")" : ""));
      }
    }
    const covered = pts.filter((p) => p.startsWith("COVERED"));
    out.items.push({
      name, sel, ...rectOf(el),
      fullyVisible: r.top >= 0 && r.bottom <= vh && r.left >= 0 && r.right <= vw,
      fullyBelow: r.top >= vh,
      partlyBelow: r.bottom > vh && r.top < vh,
      visibleFraction: Math.round(
        (Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / Math.max(1, r.height)) * 100) / 100,
      hit: pts.every((p) => p === "OK") ? "OK"
        : pts.every((p) => p === "OFFSCREEN") ? "OFFSCREEN"
        : covered.length ? "COVERED"
        : "MIXED:" + pts.filter((p) => p !== "OK").join(","),
      coveredBy: [...new Set(covered.map((c) => c.slice(8)))],
    });
  }
  return out;
};

async function measure(a) {
  await H.inject(a.win);
  return a.win.evaluate(MEASURE, CRITICAL);
}

function report(tag, m) {
  const lines = [`${tag}  ${m.vw}x${m.vh}  wrapped=${m.wrapped} hostW=${m.hostWidth} cols=[${m.colWidths}] ` +
    `cutRow=${m.cutRowPosition}${m.cutRowRect ? ` [${m.cutRowRect.t}..${m.cutRowRect.b} h${m.cutRowRect.h}]` : ""} ` +
    `hScroll=${m.hScroll} gate=${m.gateUp}`];
  for (const it of m.items) {
    if (it.missing) { lines.push(`    ${it.name.padEnd(16)} MISSING`); continue; }
    const fold = it.fullyBelow ? "BELOW-FOLD" : it.partlyBelow ? `PART(${it.visibleFraction})` : "in-view";
    lines.push(`    ${it.name.padEnd(16)} y ${String(it.t).padStart(5)}..${String(it.b).padStart(5)}  ` +
      `${fold.padEnd(11)} hit=${it.hit}${it.coveredBy.length ? " BY " + it.coveredBy.join(" , ") : ""}`);
  }
  return lines.join("\n");
}

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const results = [];
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };

  // ---- 0. the real window numbers, out of the live main process ------------
  {
    const a = await H.open({ label: "h2-geom", cwd: STUB, outDir: path.join(OUT, "geom"), skipSeeded: true });
    const g = await H.windowGeometry(a);
    say(`window geometry (live main process): ${JSON.stringify(g)}`);
    // Ask for something smaller than the minimum and see what we are handed.
    await a.app.evaluate(async ({ BrowserWindow }) => {
      const w = BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed()).pop();
      w.setContentSize(400, 300);
    });
    await a.win.waitForTimeout(500);
    say(`clamp test: asked 400x300, got ${JSON.stringify(await H.windowGeometry(a))}`);
    results.push({ phase: "geometry", geometry: g });
    await a.close();
  }

  // ---- 1. width sweep at the default height and the minimum height --------
  for (const h of [760, 600]) {
    const a = await H.open({
      label: `h2-bp-${h}`, cwd: STUB, outDir: path.join(OUT, `bp-${h}`), skipSeeded: true,
    });
    await H.setSize(a, 1200, h);
    await H.loadVideo(a);
    say(`\n===== WIDTH SWEEP, height ${h}, video loaded, 0 segments =====`);
    for (const w of [940, 950, 955, 959, 960, 961, 965, 980, 1000, 1024, 1060, 1100, 1160, 1200]) {
      const got = await H.setSize(a, w, h);
      const m = await measure(a);
      results.push({ phase: "sweep", asked: { w, h }, got, ...m });
      say(report(`sweep ${w}x${h}`, m));
      if ([940, 959, 960, 1100].includes(w)) await a.shot(`sweep-${w}x${h}`);
    }
    await a.close();
  }

  // ---- 2. the sizes that matter, with 0 / 2 / 5 segments -------------------
  for (const [w, h, why] of [
    [1100, 760, "the app's own DEFAULT window"],
    [900, 600, "the app's own MINIMUM window"],
    [960, 600, "exactly at the container-query threshold"],
    [1024, 768, "run 1's H-4 case"],
    [1280, 800, ""],
    [1440, 900, ""],
    [1920, 1080, ""],
  ]) {
    const a = await H.open({
      label: `h2-seg-${w}x${h}`, cwd: STUB, outDir: path.join(OUT, `seg-${w}x${h}`), skipSeeded: true,
    });
    // Mark from a size where Add segment is reachable, then measure at the target.
    const MARK = [Math.max(w, 1280), Math.max(h, 800)];
    await H.setSize(a, MARK[0], MARK[1]);
    await H.loadVideo(a);
    say(`\n===== ${w}x${h} ${why} =====`);
    let added = 0;
    for (const n of [0, 2, 5]) {
      if (n > added) {
        await H.setSize(a, MARK[0], MARK[1]);
        await H.addSegments(a, n - added);
        added = n;
      }
      await H.setSize(a, w, h);
      await a.win.waitForTimeout(600);
      const m = await measure(a);
      results.push({ phase: "segments", asked: { w, h }, segments: n, ...m });
      say(report(`${w}x${h} ${n}seg`, m));
      await a.shot(`${w}x${h}-${n}seg`);
    }
    await a.close();
  }

  fs.writeFileSync(path.join(DATA, "breakpoint.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(DATA, "breakpoint.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "breakpoint.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
