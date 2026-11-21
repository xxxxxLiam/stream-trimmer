/**
 * File: run-scrollbars2.cjs
 * Path: audit/run-2/area-H/run-scrollbars2.cjs
 * Description: Pass 2 of the H-6 surface check. Pass 1 (run-scrollbars.cjs)
 *   proved the rule is applied, but several panels never actually overflowed at
 *   1280x800, so their own scrollers were never exercised. This pass forces each
 *   one to overflow — short windows, seeded data, a real failed cut for the
 *   diagnostics <pre>, a long auth reason for the modal's <pre> — and adds two
 *   things pass 1 did not do:
 *
 *   - CLIPPED content: elements with overflow:hidden whose scrollHeight exceeds
 *     their clientHeight. Those have no scroll route at all, so per CLAUDE.md
 *     they are the real defect class, not a missing bar.
 *   - a REAL Tab-order keyboard route: Tab is pressed from the top of the
 *     document until focus lands inside the surface, and only then are the
 *     scroll keys used. Pass 1 focused scrollers programmatically, which a
 *     keyboard user cannot do.
 *
 *   Audit-only; no product code is touched.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot, script } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

/** Overflowing scrollers AND clipped (overflow:hidden) text, stamped for addressing. */
const STAMP_ALL = () => {
  const rows = [];
  let n = 0;
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const scrollableY = /(auto|scroll|overlay)/.test(s.overflowY) && el.scrollHeight > el.clientHeight + 1;
    const scrollableX = /(auto|scroll|overlay)/.test(s.overflowX) && el.scrollWidth > el.clientWidth + 1;
    const clippedY = s.overflowY === "hidden" && el.scrollHeight > el.clientHeight + 2;
    const clippedX = s.overflowX === "hidden" && el.scrollWidth > el.clientWidth + 2;
    if (!scrollableY && !scrollableX && !clippedY && !clippedX) continue;
    const hasText = Boolean((el.innerText || "").trim());
    if ((clippedY || clippedX) && !scrollableY && !scrollableX && !hasText) continue;
    const m = String(n++);
    el.setAttribute("data-h2", m);
    const bw = parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth);
    const bh = parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth);
    const foc = el.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select,textarea,summary,[tabindex]:not([tabindex="-1"])');
    rows.push({
      marker: m,
      what: el.id ? "#" + el.id : el.tagName.toLowerCase() + "." +
        String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 3).join("."),
      tag: el.tagName.toLowerCase(), id: el.id || null,
      ariaLabel: el.getAttribute("aria-label"),
      kind: scrollableY || scrollableX ? "scroller" : "clipped",
      overflowY: s.overflowY, overflowX: s.overflowX,
      scrollbarWidthCss: s.scrollbarWidth || "auto",
      hiddenY: el.scrollHeight - el.clientHeight,
      hiddenX: el.scrollWidth - el.clientWidth,
      gutterY: Math.round(el.offsetWidth - el.clientWidth - bw),
      gutterX: Math.round(el.offsetHeight - el.clientHeight - bh),
      ownTabIndexAttr: el.getAttribute("tabindex"),
      tabIndex: el.tabIndex,
      focusableInside: foc.length,
      textSample: (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60) || null,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    });
  }
  return rows;
};

/** Press Tab from the top until focus lands inside this element; then scroll keys. */
async function tabThenKeys(a, marker, maxTabs = 90) {
  await a.win.evaluate((m) => {
    const el = document.querySelector(`[data-h2="${m}"]`);
    if (el) el.scrollTop = 0;
    document.activeElement?.blur?.();
  }, marker);
  let tabs = 0, landed = null;
  for (let i = 0; i < maxTabs; i++) {
    await a.win.keyboard.press("Tab");
    tabs = i + 1;
    const r = await a.win.evaluate((m) => {
      const el = document.querySelector(`[data-h2="${m}"]`);
      const act = document.activeElement;
      if (!el || !act || act === document.body) return null;
      if (el === act || el.contains(act)) {
        return { what: act.id ? "#" + act.id : (act.getAttribute("aria-label") || act.tagName.toLowerCase()),
          isScrollerItself: el === act };
      }
      return null;
    }, marker);
    if (r) { landed = r; break; }
  }
  if (!landed) return { tabReachable: false, tabs };
  const read = () => a.win.evaluate((m) => {
    const e = document.querySelector(`[data-h2="${m}"]`);
    return e ? { top: Math.round(e.scrollTop), max: e.scrollHeight - e.clientHeight,
      left: Math.round(e.scrollLeft), maxX: e.scrollWidth - e.clientWidth } : null;
  }, marker);
  const start = await read();
  const keys = {};
  for (const key of ["PageDown", "End", "ArrowDown"]) {
    await a.win.evaluate((m) => { const e = document.querySelector(`[data-h2="${m}"]`); if (e) e.scrollTop = 0; }, marker);
    for (let i = 0; i < (key === "ArrowDown" ? 15 : 8); i++) {
      await a.win.keyboard.press(key);
      await a.win.waitForTimeout(60);
    }
    keys[key] = await read();
  }
  const best = Math.max(...Object.values(keys).map((k) => (k ? k.top : 0)));
  return { tabReachable: true, tabs, landedOn: landed.what, landedOnScrollerItself: landed.isScrollerItself,
    start, keys, bestScrollTop: best, reachesBottom: start ? best >= start.max - 3 : null };
}

/** Wheel over the element, to the bottom. */
async function wheelTo(a, marker) {
  const box = await a.win.evaluate((m) => {
    const el = document.querySelector(`[data-h2="${m}"]`);
    if (!el) return null;
    el.scrollTop = 0;
    const r = el.getBoundingClientRect();
    const cx = Math.round(Math.min(Math.max(r.left + r.width / 2, 4), window.innerWidth - 4));
    const cy = Math.round(Math.min(Math.max(r.top + r.height / 2, 4), window.innerHeight - 4));
    const inView = r.bottom > 0 && r.top < window.innerHeight;
    return { cx, cy, inView, max: el.scrollHeight - el.clientHeight };
  }, marker);
  if (!box) return null;
  if (!box.inView) return { skipped: "element not in the viewport" };
  await a.win.mouse.move(box.cx, box.cy);
  let last = -1;
  for (let i = 0; i < 30; i++) {
    await a.win.mouse.wheel(0, 400);
    await a.win.waitForTimeout(55);
    const t = await a.win.evaluate((m) => Math.round(document.querySelector(`[data-h2="${m}"]`)?.scrollTop ?? -1), marker);
    if (t === last && i > 1) break;
    last = t;
  }
  return { max: box.max, reached: last, reachedBottom: last >= box.max - 3 };
}

const BANK = (n) => {
  const clips = [];
  for (let i = 0; i < n; i++) {
    clips.push({
      id: `A${String(i).padStart(3, "0")}`,
      label: `Bank row ${i} — a label long enough to wrap onto a second line in the clips column`,
      segments: [{ start: i * 30, end: i * 30 + 20 }],
      status: "banked", category: i % 2 ? "hook" : "payoff", tier: `T${(i % 3) + 1}`,
    });
  }
  return { default: { stub0000001: clips } };
};

const CAMPAIGNS = (n) => Array.from({ length: n }, (_, i) => ({
  id: `camp-${i}`, name: `Campaign ${i} — a long client and batch name for the row`,
  targetMinSec: 30, targetMaxSec: 60, hardMaxSec: 90,
  clipIdPattern: "{prefix}{nn}", prefix: "C", format: "mp4", quality: "best",
  clipsDir: "", dataDir: "", usedRanges: [],
}));

const SURFACES = [
  { name: "help-drawer-body", size: [1280, 600], video: true,
    open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-help-button")?.click()); await a.win.waitForTimeout(800); } },
  { name: "help-drawer-search-results", size: [1280, 600], video: true,
    open: async (a) => {
      await a.win.evaluate(() => document.getElementById("ui-help-button")?.click());
      await a.win.waitForTimeout(800);
      await a.win.fill("#help-search", "c").catch(() => {});
      await a.win.waitForTimeout(600);
    } },
  { name: "setup-checklist", size: [1280, 600], video: true,
    open: async (a) => {
      await a.win.evaluate(() => document.getElementById("ui-help-button")?.click());
      await a.win.waitForTimeout(700);
      await a.win.evaluate(() => document.getElementById("help-setup-toggle")?.click());
      await a.win.waitForTimeout(800);
    } },
  { name: "copy-blocks", size: [1280, 600], video: true, segments: 3,
    open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-copy-blocks")?.click()); await a.win.waitForTimeout(900); } },
  { name: "symbols-palette", size: [1280, 600], video: true,
    open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-symbols")?.click()); await a.win.waitForTimeout(800); } },
  { name: "settings-popover", size: [1280, 600], video: true,
    open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-settings")?.click()); await a.win.waitForTimeout(600); } },
  { name: "campaign-menu-20", size: [1280, 600], video: false,
    seed: { "clipper.campaigns": CAMPAIGNS(20), "clipper.activeCampaign": "camp-0" },
    open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-campaign-chip")?.click()); await a.win.waitForTimeout(800); } },
  { name: "clips-bank-60-rows", size: [1280, 700], video: true,
    seed: { "clipper.bank": BANK(60) },
    open: async (a) => { await a.win.evaluate(() => document.getElementById("clips-tab-bank")?.click()); await a.win.waitForTimeout(1000); } },
  { name: "clips-all-saved", size: [1280, 700], video: true,
    seed: { "clipper.bank": BANK(60) },
    open: async (a) => { await a.win.evaluate(() => document.getElementById("clips-tab-all")?.click()); await a.win.waitForTimeout(900); } },
  { name: "import-timestamps", size: [1280, 700], video: true,
    open: async (a) => {
      await a.win.evaluate(() => document.getElementById("clips-tab-bank")?.click());
      await a.win.waitForTimeout(600);
      await a.win.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /import timestamps/i.test(x.innerText || ""));
        b?.click();
      });
      await a.win.waitForTimeout(800);
    } },
  { name: "signin-modal-short-window", size: [1000, 600], keepGate: true,
    open: async (a) => { await a.win.waitForTimeout(5000); } },
  { name: "signin-modal-pre-expanded", size: [1000, 620], keepGate: true,
    open: async (a) => {
      await a.win.waitForTimeout(5000);
      await a.win.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
      await a.win.waitForTimeout(800);
    } },
  { name: "diagnostics-pre-after-failed-cut", size: [1280, 700], video: true, segments: 1,
    open: async (a) => {
      // A real failed cut, so the diagnostics disclosure has real content.
      script(STUB, { exitCode: 1, stderr: "ERROR: ffmpeg exited 1\n".repeat(40) + "trace line\n".repeat(40) });
      await a.win.evaluate(() => document.getElementById("ui-cut")?.click());
      await a.win.waitForTimeout(9000);
      await a.win.evaluate(() => {
        for (const d of document.querySelectorAll("details")) d.open = true;
        const b = [...document.querySelectorAll("button,summary")]
          .find((x) => /diagnostic|technical detail|copy log/i.test(x.innerText || ""));
        b?.click();
      });
      await a.win.waitForTimeout(900);
    } },
  { name: "tab-strip-25-tabs", size: [1100, 760], video: false,
    seed: { "clipper.workspaces": { tabs: Array.from({ length: 25 }, (_, i) => ({ id: `w${i}`, name: `Tab number ${i}` })), activeId: "w24" } },
    open: async (a) => { await a.win.waitForTimeout(700); } },
  { name: "transcript-column", size: [1280, 600], video: true, open: async () => {} },
];

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const all = [];
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };

  for (const surf of SURFACES) {
    let a;
    try {
      script(STUB, { exitCode: 0, delayMs: 0, stderr: "", writeMedia: true });
      a = await H.open({
        label: `h2-sb2-${surf.name}`, cwd: STUB, outDir: path.join(OUT, `sb2-${surf.name}`),
        skipSeeded: !surf.keepGate, keepGate: surf.keepGate, seed: surf.seed || {},
      });
      await H.setSize(a, surf.size[0], surf.size[1]);
      if (surf.video) {
        try { await H.loadVideo(a); } catch { say(`  !! ${surf.name}: video did not load`); }
      }
      if (surf.segments) {
        await H.setSize(a, Math.max(surf.size[0], 1280), 820);
        await H.addSegments(a, surf.segments);
        await H.setSize(a, surf.size[0], surf.size[1]);
      }
      await surf.open(a);
      await a.win.waitForTimeout(500);
      const rows = await a.win.evaluate(STAMP_ALL);
      const shot = await a.shot(surf.name);
      say(`\n=== ${surf.name} (${surf.size.join("x")}) — ${rows.length} overflowing/clipped element(s) ===`);
      say(`    ${shot}`);
      for (const r of rows) {
        const wheel = r.kind === "scroller" ? await wheelTo(a, r.marker) : null;
        const kb = r.kind === "scroller" ? await tabThenKeys(a, r.marker) : null;
        all.push({ surface: surf.name, size: surf.size, ...r, wheel, keyboard: kb });
        say(`  [${r.kind}] ${r.what.padEnd(44)} hiddenY=${String(r.hiddenY).padStart(5)} hiddenX=${String(r.hiddenX).padStart(4)} ` +
          `gutterY=${r.gutterY} gutterX=${r.gutterX} sb-width=${r.scrollbarWidthCss} tabindexAttr=${r.ownTabIndexAttr} focInside=${r.focusableInside}`);
        if (r.kind === "clipped") {
          say(`      CLIPPED (overflow ${r.overflowY}/${r.overflowX}) — no scroll route. text: "${r.textSample}"`);
        } else {
          say(`      wheel: ${wheel ? (wheel.skipped || `${wheel.reached}/${wheel.max} bottom=${wheel.reachedBottom}`) : "n/a"}`);
          say(`      keyboard via real Tab: ${kb ? (kb.tabReachable
            ? `after ${kb.tabs} Tab(s) onto ${kb.landedOn}${kb.landedOnScrollerItself ? " (the scroller itself)" : ""}; ` +
              `PgDn->${kb.keys.PageDown?.top} End->${kb.keys.End?.top} ArrowDown->${kb.keys.ArrowDown?.top} of ${kb.start?.max}; ` +
              `reachesBottom=${kb.reachesBottom}`
            : `NOT REACHED by Tab in ${kb.tabs} presses`) : "n/a"}`);
        }
      }
    } catch (e) {
      say(`\n=== ${surf.name}: FAILED to reach — ${String(e).slice(0, 220)}`);
    } finally { if (a) await a.close(); }
  }

  fs.writeFileSync(path.join(DATA, "scrollbars2.json"), JSON.stringify(all, null, 2));
  fs.writeFileSync(path.join(DATA, "scrollbars2.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "scrollbars2.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
