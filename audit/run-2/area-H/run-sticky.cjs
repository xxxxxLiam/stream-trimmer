/**
 * File: run-sticky.cjs
 * Path: audit/run-2/area-H/run-sticky.cjs
 * Description: T10's sticky "Stitched total + Cut as one file" row, both halves.
 *
 *   Half one — "does not cover anything at any size >= 960px": sweeps HEIGHT at
 *   several widths above the 960 container-query threshold, with 0, 2 and 5
 *   segments, and hit-tests every control in the centre column. T10 only
 *   measured heights 760 and above, which is why it missed what happens when the
 *   window is short. For anything it finds covered it then scrolls the centre
 *   column to its own maximum and re-tests, because a sticky row that covers a
 *   control the user can scroll out from under it is a nuisance, while one that
 *   covers it at every scroll position is a broken control.
 *
 *   Half two — exactly what is unreachable at 900x600: measures position, then
 *   tries to reach each off-screen control by wheel, by Tab, and by the keyboard
 *   scroll keys, and records what actually works.
 *
 *   Audit-only; no product code is touched.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

const CENTRE = [
  ["#ui-mark-in", "In field"],
  ["#ui-mark-out", "Out field"],
  ["#ui-mark-whole", "Whole video"],
  ["#ui-add-segment", "Add segment"],
  ["#ui-cut", "Cut"],
  ["#ui-stitched-total", "Stitched total"],
  ["#ui-timeline", "Timeline"],
  ["#ui-segment-list", "Segment list"],
];

/** Hit-test the listed controls, and report the centre column's scroll state. */
const HIT = (targets) => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const centre = document.querySelector(".cols-centre");
  const cutRow = document.getElementById("ui-cut-row");
  const items = [];
  for (const [sel, name] of targets) {
    const el = document.querySelector(sel);
    if (!el) { items.push({ name, missing: true }); continue; }
    const r = el.getBoundingClientRect();
    const pts = [];
    for (const fx of [0.1, 0.5, 0.9]) for (const fy of [0.25, 0.5, 0.75]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x > vw || y > vh) { pts.push("OFFSCREEN"); continue; }
      const hit = document.elementFromPoint(x, y);
      if (!hit) { pts.push("NONE"); continue; }
      if (hit === el || el.contains(hit) || hit.contains(el)) { pts.push("OK"); continue; }
      const anc = hit.closest("[id]");
      pts.push("COVERED:" + (anc && anc.id ? "#" + anc.id : hit.tagName.toLowerCase()));
    }
    const cov = pts.filter((p) => p.startsWith("COVERED"));
    items.push({
      name, t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height),
      centreUsable: pts.filter((p) => p === "OK").length,
      verdict: pts.every((p) => p === "OK") ? "OK"
        : pts.every((p) => p === "OFFSCREEN") ? "OFFSCREEN"
        : cov.length === 9 ? "FULLY-COVERED"
        : cov.length ? "PART-COVERED" : "PART-OFFSCREEN",
      coveredBy: [...new Set(cov.map((c) => c.slice(8)))],
    });
  }
  return {
    vw, vh,
    cutRow: cutRow ? (() => { const r = cutRow.getBoundingClientRect();
      return { pos: getComputedStyle(cutRow).position, t: Math.round(r.top), b: Math.round(r.bottom), h: Math.round(r.height) }; })() : null,
    centre: centre ? {
      scrollTop: Math.round(centre.scrollTop),
      scrollHeight: centre.scrollHeight,
      clientHeight: centre.clientHeight,
      maxScroll: centre.scrollHeight - centre.clientHeight,
      overflowY: getComputedStyle(centre).overflowY,
    } : null,
    items,
  };
};

const scrollCentre = (win, to) => win.evaluate((t) => {
  const c = document.querySelector(".cols-centre");
  if (!c) return null;
  c.scrollTop = t === "max" ? c.scrollHeight : 0;
  return Math.round(c.scrollTop);
}, to);

function line(tag, m) {
  const out = [`${tag}  ${m.vw}x${m.vh}  cutRow=${m.cutRow ? `${m.cutRow.pos} ${m.cutRow.t}..${m.cutRow.b}` : "-"}  ` +
    `centre=${m.centre ? `scrollTop ${m.centre.scrollTop}/${m.centre.maxScroll} (${m.centre.overflowY})` : "-"}`];
  for (const it of m.items) {
    if (it.missing) { out.push(`    ${it.name.padEnd(15)} MISSING`); continue; }
    out.push(`    ${it.name.padEnd(15)} y ${String(it.t).padStart(5)}..${String(it.b).padStart(5)}  ` +
      `${it.verdict.padEnd(15)}${it.coveredBy.length ? " by " + it.coveredBy.join(",") : ""}`);
  }
  return out.join("\n");
}

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const results = [];
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };

  // ---- half one: heights above the threshold -------------------------------
  // The brief's claim is "no coverage at any size >= 960px". Width alone does not
  // settle it: the row is 91px tall and the window can be 600px tall at any width.
  for (const w of [960, 1024, 1100, 1280, 1440]) {
    const a = await H.open({
      label: `h2-sticky-${w}`, cwd: STUB, outDir: path.join(OUT, `sticky-${w}`), skipSeeded: true,
    });
    await H.setSize(a, Math.max(w, 1280), 820);
    await H.loadVideo(a);
    say(`\n########## width ${w} ##########`);
    let added = 0;
    for (const segs of [0, 2, 5]) {
      if (segs > added) {
        await H.setSize(a, Math.max(w, 1280), 820);
        await H.addSegments(a, segs - added);
        added = segs;
      }
      for (const h of [600, 620, 660, 700, 760, 820]) {
        await H.setSize(a, w, h);
        await a.win.waitForTimeout(450);
        await scrollCentre(a.win, 0);
        const top = await a.win.evaluate(HIT, CENTRE);
        let bottom = null;
        const anyCovered = top.items.some((i) => String(i.verdict).includes("COVERED"));
        if (anyCovered && top.centre && top.centre.maxScroll > 0) {
          await scrollCentre(a.win, "max");
          await a.win.waitForTimeout(250);
          bottom = await a.win.evaluate(HIT, CENTRE);
        }
        results.push({ phase: "heights", w, h, segs, top, bottom });
        say(line(`${w}x${h} ${segs}seg  scrollTop=0 `, top));
        if (bottom) say(line(`${w}x${h} ${segs}seg  scrolled-to-BOTTOM`, bottom));
        if (anyCovered && (h === 600 || h === 700)) await a.shot(`${w}x${h}-${segs}seg-covered`);
      }
    }
    await a.close();
  }

  // ---- half two: what is unreachable at 900x600 ----------------------------
  {
    const a = await H.open({
      label: "h2-sticky-min", cwd: STUB, outDir: path.join(OUT, "sticky-900x600"), skipSeeded: true,
    });
    await H.setSize(a, 1280, 820);
    await H.loadVideo(a);
    say(`\n########## 900x600 — the app's own advertised minimum ##########`);
    let added = 0;
    for (const segs of [0, 2, 5]) {
      if (segs > added) {
        await H.setSize(a, 1280, 820);
        await H.addSegments(a, segs - added);
        added = segs;
      }
      await H.setSize(a, 900, 600);
      await a.win.waitForTimeout(500);
      const m = await a.win.evaluate(HIT, CENTRE);
      say(line(`900x600 ${segs}seg  as-opened`, m));
      await a.shot(`900x600-${segs}seg`);

      // Which scroller owns the off-screen controls, and can each route reach them?
      const route = await a.win.evaluate(() => {
        const res = {};
        const hostEl = document.querySelector(".cols-host");
        res.host = hostEl ? {
          tabIndex: hostEl.tabIndex, ariaLabel: hostEl.getAttribute("aria-label"),
          role: hostEl.getAttribute("role"),
          scrollTop: Math.round(hostEl.scrollTop),
          maxScroll: hostEl.scrollHeight - hostEl.clientHeight,
        } : null;
        return res;
      });
      say(`    workspace scroller: ${JSON.stringify(route.host)}`);

      // Wheel over the workspace, to the bottom.
      await a.win.mouse.move(450, 350);
      let lastTop = -1;
      for (let i = 0; i < 25; i++) {
        await a.win.mouse.wheel(0, 400);
        await a.win.waitForTimeout(60);
        const t = await a.win.evaluate(() => Math.round(document.querySelector(".cols-host")?.scrollTop ?? -1));
        if (t === lastTop && i > 1) break;
        lastTop = t;
      }
      const afterWheel = await a.win.evaluate(HIT, CENTRE);
      say(line(`900x600 ${segs}seg  after WHEEL to bottom (scrollTop ${lastTop})`, afterWheel));
      await a.shot(`900x600-${segs}seg-wheeled`);

      // Keyboard: focus the workspace region and press End, then Home.
      await a.win.evaluate(() => { const h = document.querySelector(".cols-host"); h.scrollTop = 0; h.focus(); });
      const kbFocus = await a.win.evaluate(() => ({
        active: document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName,
        isHost: document.activeElement === document.querySelector(".cols-host"),
      }));
      await a.win.keyboard.press("End");
      await a.win.waitForTimeout(300);
      const afterEnd = await a.win.evaluate(HIT, CENTRE);
      const endTop = await a.win.evaluate(() => Math.round(document.querySelector(".cols-host")?.scrollTop ?? -1));
      say(`    keyboard focus: ${JSON.stringify(kbFocus)}`);
      say(line(`900x600 ${segs}seg  after END key (scrollTop ${endTop})`, afterEnd));

      // Tab: can Tab alone bring Cut into view and focus it?
      await a.win.evaluate(() => { document.querySelector(".cols-host").scrollTop = 0;
        document.activeElement?.blur?.(); });
      let tabbedTo = null, tabs = 0;
      for (let i = 0; i < 90; i++) {
        await a.win.keyboard.press("Tab");
        tabs = i + 1;
        const got = await a.win.evaluate(() => {
          const el = document.activeElement;
          if (el && el.id === "ui-cut") {
            const r = el.getBoundingClientRect();
            return { id: el.id, t: Math.round(r.top), b: Math.round(r.bottom), vh: window.innerHeight,
              inView: r.top >= 0 && r.bottom <= window.innerHeight,
              hostScrollTop: Math.round(document.querySelector(".cols-host")?.scrollTop ?? -1) };
          }
          return null;
        });
        if (got) { tabbedTo = { ...got, tabs }; break; }
      }
      say(`    Tab to #ui-cut: ${tabbedTo ? JSON.stringify(tabbedTo) : `NOT REACHED in ${tabs} presses`}`);
      results.push({ phase: "min", segs, asOpened: m, afterWheel, afterEnd, kbFocus, host: route.host, tabbedTo, wheelScrollTop: lastTop, endScrollTop: endTop });
    }
    await a.close();
  }

  fs.writeFileSync(path.join(DATA, "sticky.json"), JSON.stringify(results, null, 2));
  fs.writeFileSync(path.join(DATA, "sticky.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "sticky.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
