/**
 * File: shots-h2-1.cjs
 * Path: audit/run-2/area-H/shots-h2-1.cjs
 * Description: Screenshots of H2-1 in the state the app presents — the centre
 *   column at scrollTop 0, before anything is scrolled. run-sticky.cjs took its
 *   shots after the scrolled-to-bottom retest, so they show the cleared state
 *   rather than the covered one. This also re-reads the hit test immediately
 *   before each shot, so the picture and the numbers come from the same frame,
 *   and draws no overlay of its own. Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot, script } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");

const OUT = path.join(__dirname, "out");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

const HIT = () => {
  const out = { cutRow: null, items: [] };
  const cr = document.getElementById("ui-cut-row");
  if (cr) { const r = cr.getBoundingClientRect();
    out.cutRow = { pos: getComputedStyle(cr).position, t: Math.round(r.top), b: Math.round(r.bottom) }; }
  const c = document.querySelector(".cols-centre");
  out.centreScrollTop = c ? Math.round(c.scrollTop) : null;
  out.centreMaxScroll = c ? c.scrollHeight - c.clientHeight : null;
  for (const [sel, name] of [["#ui-mark-in", "In"], ["#ui-mark-out", "Out"],
    ["#ui-mark-whole", "Whole video"], ["#ui-add-segment", "Add segment"], ["#ui-cut", "Cut"]]) {
    const el = document.querySelector(sel);
    if (!el) { out.items.push({ name, missing: true }); continue; }
    const r = el.getBoundingClientRect();
    let ok = 0, cov = new Set();
    for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.25, 0.5, 0.75]) {
      const hit = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy);
      if (hit && (hit === el || el.contains(hit))) ok++;
      else if (hit) { const a = hit.closest("[id]"); cov.add(a?.id ? "#" + a.id : hit.tagName.toLowerCase()); }
    }
    out.items.push({ name, t: Math.round(r.top), b: Math.round(r.bottom),
      pointsReachingTheControl: `${ok}/9`, coveredBy: [...cov] });
  }
  return out;
};

(async () => {
  buildStubRoot(STUB);
  script(STUB, { exitCode: 0, stderr: "", delayMs: 0, writeMedia: true, authFail: false });
  const lines = [];
  const say = (s) => { console.log(s); lines.push(s); };

  const a = await H.open({ label: "h2-shots", cwd: STUB, outDir: path.join(OUT, "h2-1-shots"), skipSeeded: true });
  await H.setSize(a, 1280, 820);
  await H.loadVideo(a);
  let added = 0;
  for (const segs of [0, 2, 5]) {
    if (segs > added) { await H.setSize(a, 1280, 820); await H.addSegments(a, segs - added); added = segs; }
    for (const [w, h] of [[1280, 600], [1100, 600], [960, 600], [1100, 620]]) {
      await H.setSize(a, w, h);
      await a.win.waitForTimeout(600);
      await a.win.evaluate(() => { const c = document.querySelector(".cols-centre"); if (c) c.scrollTop = 0; });
      await a.win.waitForTimeout(250);
      const m = await a.win.evaluate(HIT);
      say(`${w}x${h} ${segs}seg  scrollTop=${m.centreScrollTop}/${m.centreMaxScroll}  cutRow ${JSON.stringify(m.cutRow)}`);
      for (const it of m.items) {
        say(`    ${it.name.padEnd(12)} y ${it.t}..${it.b}  reaches ${it.pointsReachingTheControl}` +
          `${it.coveredBy.length ? "  covered by " + it.coveredBy.join(",") : ""}`);
      }
      say(`    shot ${await a.shot(`${w}x${h}-${segs}seg-scrolltop0`)}`);
    }
  }
  // And the 13-inch laptop at 150% zoom, which lands on exactly 960x600.
  await H.setSize(a, 1440, 900);
  await H.setZoom(a, 1.5);
  await a.win.waitForTimeout(700);
  await a.win.evaluate(() => { const c = document.querySelector(".cols-centre"); if (c) c.scrollTop = 0; });
  const z = await a.win.evaluate(HIT);
  say(`\n1440x900 at 150% zoom (CSS 960x600), 5 segments  cutRow ${JSON.stringify(z.cutRow)}`);
  for (const it of z.items) {
    say(`    ${it.name.padEnd(12)} y ${it.t}..${it.b}  reaches ${it.pointsReachingTheControl}` +
      `${it.coveredBy.length ? "  covered by " + it.coveredBy.join(",") : ""}`);
  }
  say(`    shot ${await a.shot("1440x900-zoom150-5seg")}`);
  await H.setZoom(a, 1);
  fs.writeFileSync(path.join(OUT, "data", "h2-1-shots.txt"), lines.join("\n"));
  await a.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
