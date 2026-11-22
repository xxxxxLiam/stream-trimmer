/**
 * File: run-scrollbars.cjs
 * Path: audit/run-2/area-H/run-scrollbars.cjs
 * Description: H-6 re-check, surface by surface. T3 added the no-scrollbar rule
 *   app-wide but explicitly did NOT check the help drawer, Copy blocks, the
 *   Symbols palette, the sign-in modal, the Clips column, the setup checklist,
 *   the campaign menu, the settings popover or the three <pre> overflow blocks.
 *   This opens each one, makes it actually overflow, and for every scroller it
 *   finds there answers three questions with evidence:
 *
 *     1. is a bar painted?  (layout gutter, computed scrollbar-width, AND a
 *        pixel diff of the scroller's right-edge strip taken mid-scroll, which
 *        is the only way to catch an overlay bar that takes no layout space)
 *     2. does the WHEEL reach the bottom?
 *     3. does the KEYBOARD reach the bottom?  (ArrowDown, PageDown, End, Home —
 *        from the scroller itself if it is focusable, else from the first
 *        focusable thing inside it)
 *
 *   Per CLAUDE.md the missing bar is never the defect; unreachable content is.
 *   Audit-only; no product code is touched.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

/** Every element that is genuinely overflowing right now, with its bar geometry. */
const FIND_SCROLLERS = () => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const oy = s.overflowY, ox = s.overflowX;
    const overY = el.scrollHeight > el.clientHeight + 1 && /(auto|scroll|overlay)/.test(oy);
    const overX = el.scrollWidth > el.clientWidth + 1 && /(auto|scroll|overlay)/.test(ox);
    if (!overY && !overX) continue;
    const bw = parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth);
    const bh = parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth);
    const focusables = el.querySelectorAll(
      'a[href],button:not([disabled]),input:not([disabled]),select,textarea,summary,[tabindex]:not([tabindex="-1"])');
    out.push({
      sel: el.id ? "#" + el.id : null,
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: String(el.className || "").slice(0, 70),
      ariaLabel: el.getAttribute("aria-label"),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      overflowY: oy, overflowX: ox,
      scrollbarWidthCss: s.scrollbarWidth || "auto",
      hiddenY: el.scrollHeight - el.clientHeight,
      hiddenX: el.scrollWidth - el.clientWidth,
      gutterY: Math.round(el.offsetWidth - el.clientWidth - bw),
      gutterX: Math.round(el.offsetHeight - el.clientHeight - bh),
      ownTabIndex: el.tabIndex,
      hasOwnTabindexAttr: el.hasAttribute("tabindex"),
      focusableInside: focusables.length,
      firstFocusableInside: focusables.length
        ? (focusables[0].id ? "#" + focusables[0].id : focusables[0].tagName.toLowerCase() +
            (focusables[0].getAttribute("aria-label") ? `[aria-label="${focusables[0].getAttribute("aria-label")}"]` : ""))
        : null,
    });
  }
  return out;
};

/** Stamp a data-h2 marker on each overflowing element so we can address it. */
const STAMP = () => {
  let n = 0;
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    const overY = el.scrollHeight > el.clientHeight + 1 && /(auto|scroll|overlay)/.test(s.overflowY);
    const overX = el.scrollWidth > el.clientWidth + 1 && /(auto|scroll|overlay)/.test(s.overflowX);
    if (!overY && !overX) continue;
    el.setAttribute("data-h2", String(n++));
  }
  return n;
};

/** Wheel over the element's centre, then report how far it moved. */
async function wheelTest(a, marker) {
  const box = await a.win.evaluate((m) => {
    const el = document.querySelector(`[data-h2="${m}"]`);
    if (!el) return null;
    el.scrollTop = 0;
    const r = el.getBoundingClientRect();
    return { cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2),
      max: el.scrollHeight - el.clientHeight };
  }, marker);
  if (!box) return null;
  // Keep the pointer inside the viewport or the wheel lands elsewhere.
  if (box.cx < 2 || box.cy < 2) return { skipped: "offscreen" };
  await a.win.mouse.move(box.cx, box.cy);
  let last = 0;
  for (let i = 0; i < 30; i++) {
    await a.win.mouse.wheel(0, 400);
    await a.win.waitForTimeout(60);
    const t = await a.win.evaluate((m) => document.querySelector(`[data-h2="${m}"]`)?.scrollTop ?? -1, marker);
    if (t === last && i > 1) break;
    last = t;
  }
  return { max: box.max, reached: last, reachedBottom: last >= box.max - 2 };
}

/** Keyboard route: focus the scroller (or the first focusable inside) and drive keys. */
async function keyboardTest(a, marker) {
  const info = await a.win.evaluate((m) => {
    const el = document.querySelector(`[data-h2="${m}"]`);
    if (!el) return null;
    el.scrollTop = 0;
    const max = el.scrollHeight - el.clientHeight;
    // Preferred route: the scroller itself, if it can take focus.
    el.focus({ preventScroll: true });
    let via = document.activeElement === el ? "scroller" : null;
    if (!via) {
      const f = el.querySelector(
        'a[href],button:not([disabled]),input:not([disabled]),select,textarea,summary,[tabindex]:not([tabindex="-1"])');
      if (f) { f.focus({ preventScroll: true }); via = el.contains(document.activeElement) ? "child" : null; }
    }
    return { max, via, active: document.activeElement?.tagName?.toLowerCase() || null,
      activeId: document.activeElement?.id || null, scrollTopAfterFocus: el.scrollTop };
  }, marker);
  if (!info) return null;
  if (!info.via) return { ...info, verdict: "NO-KEYBOARD-ROUTE", perKey: {} };

  const read = () => a.win.evaluate((m) => document.querySelector(`[data-h2="${m}"]`)?.scrollTop ?? -1, marker);
  const reset = () => a.win.evaluate((m) => { const e = document.querySelector(`[data-h2="${m}"]`); if (e) e.scrollTop = 0; }, marker);
  const perKey = {};
  for (const key of ["ArrowDown", "PageDown", "End"]) {
    await reset();
    const before = await read();
    for (let i = 0; i < (key === "ArrowDown" ? 12 : 1); i++) {
      await a.win.keyboard.press(key);
      await a.win.waitForTimeout(90);
    }
    perKey[key] = { before, after: await read() };
  }
  // End should land at the bottom; Home should bring it back.
  await reset();
  await a.win.keyboard.press("End");
  await a.win.waitForTimeout(150);
  const atEnd = await read();
  await a.win.keyboard.press("Home");
  await a.win.waitForTimeout(150);
  const atHome = await read();
  // And: can repeated PageDown reach the bottom?
  await reset();
  let pd = 0;
  for (let i = 0; i < 25; i++) {
    await a.win.keyboard.press("PageDown");
    await a.win.waitForTimeout(70);
    const t = await read();
    if (t === pd && i > 0) break;
    pd = t;
  }
  const reachesBottom = atEnd >= info.max - 2 || pd >= info.max - 2;
  return {
    ...info, perKey, endLands: atEnd, homeLands: atHome, pageDownReached: pd,
    reachesBottom,
    verdict: reachesBottom ? "REACHABLE" : "NOT-REACHABLE-BY-KEYBOARD",
  };
}

/**
 * Pixel evidence for a painted bar: screenshot the scroller's right-edge strip
 * at rest and again mid-scroll, and diff. A classic bar shows at rest; an
 * overlay bar shows mid-scroll. Identical buffers at both = nothing painted.
 */
async function barPixels(a, marker) {
  const box = await a.win.evaluate((m) => {
    const el = document.querySelector(`[data-h2="${m}"]`);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const w = 18, x = Math.round(r.right - w);
    if (x < 0 || r.top < 0 || r.height < 20 || r.right > window.innerWidth) return null;
    el.scrollTop = 0;
    return { x, y: Math.round(r.top) + 2, width: w, height: Math.min(Math.round(r.height) - 4, 200) };
  }, marker);
  if (!box) return { skipped: "not clippable" };
  const rest = await a.win.screenshot({ clip: box });
  // Mid-scroll: an overlay bar is only painted while scrolling / just after.
  await a.win.evaluate((m) => {
    const el = document.querySelector(`[data-h2="${m}"]`);
    if (el) el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2);
  }, marker);
  const during = await a.win.screenshot({ clip: box });
  await a.win.evaluate((m) => { const e = document.querySelector(`[data-h2="${m}"]`); if (e) e.scrollTop = 0; }, marker);
  const back = await a.win.screenshot({ clip: box });
  return {
    box,
    restEqualsBack: Buffer.compare(rest, back) === 0,
    // A vertical bar is a near-constant column; approximate by asking whether the
    // strip changed at all between rest and mid-scroll beyond the content moving.
    restBytes: rest.length, duringBytes: during.length,
    restHash: require("node:crypto").createHash("sha1").update(rest).digest("hex").slice(0, 12),
    duringHash: require("node:crypto").createHash("sha1").update(during).digest("hex").slice(0, 12),
  };
}

// ---- the surfaces -------------------------------------------------------
const BANK_ROWS = (videoId, campaign) => {
  const rows = [];
  for (let i = 0; i < 30; i++) {
    const s = i * 30, e = s + 20;
    const f = (t) => `${String(Math.floor(t / 3600)).padStart(2, "0")}:${String(Math.floor((t % 3600) / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    rows.push({ id: `row${i}`, clipId: `A${String(i).padStart(2, "0")}`, label: `Bank row ${i} long enough to wrap onto a second line`,
      start: f(s), end: f(e), category: i % 2 ? "hook" : "payoff", tier: `T${(i % 3) + 1}`, status: "planned" });
  }
  return { [campaign]: { [videoId]: rows } };
};

const SURFACES = [
  {
    name: "workspace stack (wrapped layout)",
    size: [900, 600], video: true,
    open: async () => {},
  },
  {
    name: "help drawer body",
    size: [1280, 800], video: true,
    open: async (a) => { await a.win.click("#ui-help-button"); await a.win.waitForTimeout(700); },
  },
  {
    name: "setup checklist (#help-setup-panel)",
    size: [1280, 800], video: true,
    open: async (a) => {
      await a.win.click("#ui-help-button"); await a.win.waitForTimeout(700);
      await a.win.evaluate(() => document.getElementById("help-setup-toggle")?.click());
      await a.win.waitForTimeout(700);
    },
  },
  {
    name: "Copy blocks panel",
    size: [1280, 800], video: true,
    open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-copy-blocks")?.click()); await a.win.waitForTimeout(700); },
  },
  {
    name: "Symbols palette",
    size: [1280, 800], video: true,
    open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-symbols")?.click()); await a.win.waitForTimeout(700); },
  },
  {
    name: "Settings popover",
    size: [1280, 800], video: true,
    open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-settings")?.click()); await a.win.waitForTimeout(500); },
  },
  {
    name: "Campaign menu (12 campaigns)",
    size: [1280, 800], video: false,
    seed: {
      "clipper.campaigns": Array.from({ length: 12 }, (_, i) => ({
        id: `camp-${i}`, name: `Campaign number ${i} with a fairly long client name`,
        minSeconds: 30, maxSeconds: 60, pattern: "{clip}-{slug}", prefix: "C",
      })),
      "clipper.activeCampaignId": "camp-0",
    },
    open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-campaign-chip")?.click()); await a.win.waitForTimeout(600); },
  },
  {
    name: "Clips column — Bank tab, 30 rows",
    size: [1280, 800], video: true,
    seed: { "clipper.bank": BANK_ROWS("stub0000001", "default") },
    open: async (a) => {
      await a.win.evaluate(() => document.getElementById("clips-tab-bank")?.click());
      await a.win.waitForTimeout(800);
    },
  },
  {
    name: "Clips column — Import timestamps",
    size: [1280, 800], video: true,
    open: async (a) => {
      await a.win.evaluate(() => document.getElementById("clips-tab-bank")?.click());
      await a.win.waitForTimeout(600);
      await a.win.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /import timestamps/i.test(x.innerText || ""));
        b?.click();
      });
      await a.win.waitForTimeout(600);
    },
  },
  {
    name: "sign-in modal card",
    size: [1024, 620], video: false, keepGate: true,
    open: async (a) => { await a.win.waitForTimeout(4000); },
  },
  {
    name: "sign-in modal <pre> (both disclosures open)",
    size: [1024, 700], video: false, keepGate: true,
    open: async (a) => {
      await a.win.waitForTimeout(4000);
      await a.win.evaluate(() => { for (const d of document.querySelectorAll("details")) d.open = true; });
      await a.win.waitForTimeout(600);
    },
  },
  {
    name: "footer format popover",
    size: [1280, 800], video: true,
    open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-footer-format")?.click()); await a.win.waitForTimeout(500); },
  },
  {
    name: "tab strip, 25 tabs (horizontal)",
    size: [1100, 760], video: false,
    seed: {
      "clipper.workspaces": Array.from({ length: 25 }, (_, i) => ({ id: `w${i}`, title: `Tab number ${i}`, url: "" })),
      "clipper.activeWorkspaceId": "w24",
    },
    open: async () => {},
  },
];

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const all = [];
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };

  for (const surf of SURFACES) {
    const label = surf.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    let a;
    try {
      a = await H.open({
        label: `h2-sb-${label}`, cwd: STUB, outDir: path.join(OUT, `sb-${label}`),
        skipSeeded: !surf.keepGate, keepGate: surf.keepGate, seed: surf.seed || {},
      });
      await H.setSize(a, surf.size[0], surf.size[1]);
      if (surf.video) {
        try { await H.loadVideo(a); } catch { say(`  !! ${surf.name}: video did not load`); }
      }
      await surf.open(a);
      await a.win.waitForTimeout(400);
      const n = await a.win.evaluate(STAMP);
      const found = await a.win.evaluate(FIND_SCROLLERS);
      const shot = await a.shot(label);
      say(`\n=== ${surf.name} (${surf.size.join("x")}) — ${n} overflowing element(s) ===`);
      say(`    shot ${shot}`);
      const rows = [];
      for (let i = 0; i < n; i++) {
        const meta = found[i] || {};
        const px = await barPixels(a, i);
        const wheel = await wheelTest(a, i);
        const kb = await keyboardTest(a, i);
        const row = { surface: surf.name, marker: i, ...meta, pixels: px, wheel, keyboard: kb };
        rows.push(row);
        const who = meta.id ? "#" + meta.id : `${meta.tag}.${(meta.cls || "").split(/\s+/).slice(0, 2).join(".")}`;
        say(`    ${who.padEnd(46)} hiddenY=${String(meta.hiddenY).padStart(5)} ` +
          `gutterY=${meta.gutterY} gutterX=${meta.gutterX} sb-width=${meta.scrollbarWidthCss} ` +
          `tabIndex=${meta.ownTabIndex} focusablesInside=${meta.focusableInside}`);
        say(`      wheel: ${wheel ? `${wheel.reached}/${wheel.max} bottom=${wheel.reachedBottom}` : "n/a"}` +
          `   keyboard: ${kb ? `${kb.verdict} via=${kb.via} End->${kb.endLands} Home->${kb.homeLands} PgDn->${kb.pageDownReached}/${kb.max}` : "n/a"}`);
      }
      all.push(...rows);
    } catch (e) {
      say(`\n=== ${surf.name}: FAILED to reach — ${String(e).slice(0, 200)}`);
    } finally {
      if (a) await a.close();
    }
  }

  fs.writeFileSync(path.join(DATA, "scrollbars.json"), JSON.stringify(all, null, 2));
  fs.writeFileSync(path.join(DATA, "scrollbars.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "scrollbars.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
