/**
 * File: run-extras.cjs
 * Path: audit/run-2/area-H/run-extras.cjs
 * Description: The things the first passes turned up and could not settle.
 *
 *   1. The app shell clips. `div.surface-ground.h-screen` reported 84px of
 *      content past its own clipped box at 1280x600 with Copy blocks open,
 *      with overflow:hidden on both axes and no scroll route. What is in
 *      those 84px, and is it reachable at all?
 *   2. The Clips column's own scroller, with a real campaign so the bank seed
 *      actually lands (campaignId comes from the ACTIVE campaign; seeding the
 *      bank alone keys it to nothing).
 *   3. Many tabs and the accessibility tree: every workspace mounts in full, so
 *      the landmark and heading counts multiply. Measured at 1, 5 and 25 tabs.
 *   4. Truncation: every clipped text box, and whether it carries a title.
 *   5. The second `disabled:opacity-40` control (TimeRangeControls' clear
 *      button) measured as a graphic, since it has no text node.
 *   6. CopyBlocks' preview <pre>: max-h-[72px] with overflow-hidden.
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

const CAMPAIGN = {
  id: "c1", name: "Acme Q4 — Vertical Cutdowns, Weekly Batch (Team B), long enough to truncate",
  targetMinSec: 30, targetMaxSec: 60, hardMaxSec: 90,
  clipIdPattern: "{prefix}{nn}", prefix: "A", format: "mp4", quality: "best",
  clipsDir: "", dataDir: "", usedRanges: [],
};
const BANK60 = { c1: { stub0000001: Array.from({ length: 60 }, (_, i) => ({
  id: `A${String(i).padStart(3, "0")}`,
  label: `Bank row ${i} — a label long enough to be truncated in the clips column`,
  segments: [{ start: i * 30, end: i * 30 + 20 }],
  status: "banked", category: i % 2 ? "hook" : "payoff", tier: `T${(i % 3) + 1}`,
})) } };

/** What is clipped off the shell, and is there any scroll route to it? */
const SHELL_CLIP = () => {
  const shell = document.querySelector("div.surface-ground") || document.getElementById("root");
  if (!shell) return null;
  const s = getComputedStyle(shell);
  const hiddenY = shell.scrollHeight - shell.clientHeight;
  // Who sticks out past the shell's own box?
  const bottom = shell.getBoundingClientRect().bottom;
  const past = [];
  for (const el of shell.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const r = el.getBoundingClientRect();
    if (r.height < 4 || r.width < 4) continue;
    if (r.top >= bottom - 1) {
      past.push({ what: el.id ? "#" + el.id : el.tagName.toLowerCase() + "." +
        String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 3).join("."),
        t: Math.round(r.top), b: Math.round(r.bottom),
        text: (el.innerText || "").trim().replace(/\s+/g, " ").slice(0, 60) });
    }
  }
  // Can anything be scrolled to bring it back?
  const before = shell.scrollTop;
  shell.scrollTop = 9999;
  const moved = shell.scrollTop;
  shell.scrollTop = before;
  const footer = document.querySelector("footer");
  const fr = footer ? footer.getBoundingClientRect() : null;
  return {
    shell: shell.id ? "#" + shell.id : "div.surface-ground",
    overflowY: s.overflowY, overflowX: s.overflowX, height: s.height,
    clientHeight: shell.clientHeight, scrollHeight: shell.scrollHeight, hiddenY,
    shellBottom: Math.round(bottom), viewportHeight: window.innerHeight,
    programmaticScrollMoved: moved,
    elementsStartingBelowTheShell: past.slice(0, 14),
    footerRect: fr ? { t: Math.round(fr.top), b: Math.round(fr.bottom) } : null,
    footerFullyVisible: fr ? fr.bottom <= window.innerHeight + 1 : null,
    footerText: footer ? (footer.innerText || "").trim().replace(/\s+/g, " ").slice(0, 90) : null,
  };
};

const LANDMARKS = () => ({
  tabs: document.querySelectorAll('[role="tab"]').length,
  header: document.querySelectorAll("header").length,
  main: document.querySelectorAll("main").length,
  footer: document.querySelectorAll("footer").length,
  regionRole: document.querySelectorAll('[role="region"]').length,
  sectionNamed: document.querySelectorAll("section[aria-label]").length,
  headings: document.querySelectorAll("h1,h2,h3,h4,h5,h6").length,
  headingsVisible: [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
    .filter((h) => { const s = getComputedStyle(h); return s.display !== "none" && s.visibility !== "hidden"; }).length,
  duplicateIds: (() => {
    const m = new Map();
    for (const e of document.querySelectorAll("[id]")) m.set(e.id, (m.get(e.id) || 0) + 1);
    return [...m.entries()].filter(([, v]) => v > 1).map(([id, n]) => ({ id, n }));
  })(),
  tabIndexZeroCount: document.querySelectorAll('[tabindex="0"]').length,
  totalElements: document.querySelectorAll("*").length,
});

/** Every visibly truncated text box, and whether a title rescues it. */
const TRUNCATIONS = () => {
  const out = [];
  for (const el of document.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") continue;
    const txt = (el.innerText || "").trim();
    if (!txt) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) continue;
    if (/(^|\s)(sr-only|visually-hidden)(\s|$)/.test(el.getAttribute("class") || "")) continue;
    const hx = el.scrollWidth - el.clientWidth;
    const hy = el.scrollHeight - el.clientHeight;
    const clipX = hx > 2 && s.overflowX === "hidden";
    const clipY = hy > 2 && s.overflowY === "hidden";
    if (!clipX && !clipY) continue;
    // Only count the innermost box that owns the text, not every ancestor.
    if ([...el.children].some((c) => { const cs = getComputedStyle(c);
      return (c.scrollWidth - c.clientWidth > 2 && cs.overflowX === "hidden") ||
        (c.scrollHeight - c.clientHeight > 2 && cs.overflowY === "hidden"); })) continue;
    out.push({
      what: el.id ? "#" + el.id : el.tagName.toLowerCase() + "." +
        String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 3).join("."),
      axis: clipX ? "x" : "y", hiddenPx: clipX ? hx : hy,
      ellipsis: s.textOverflow === "ellipsis",
      hasOwnTitle: el.hasAttribute("title"),
      hasAncestorTitle: Boolean(el.closest("[title]")),
      ariaLabel: el.getAttribute("aria-label") ||
        (el.closest("[aria-label]")?.getAttribute("aria-label") ?? null),
      text: txt.replace(/\s+/g, " ").slice(0, 70),
    });
  }
  return out;
};

/** A graphic's contrast: the second disabled:opacity-40 control has no text. */
const GRAPHIC = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return { sel, missing: true };
  const svg = el.querySelector("svg") || el;
  const parse = (c) => { const m = String(c || "").match(/rgba?\(([^)]+)\)/);
    if (!m) return null; const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  const fg = parse(getComputedStyle(svg).color);
  let o = 1, n = el;
  while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity || "1"); n = n.parentElement; }
  let bg = null; n = el;
  while (n && n.nodeType === 1) { const c = parse(getComputedStyle(n).backgroundColor);
    if (c && c.a >= 1) { bg = c; break; } n = n.parentElement; }
  if (!bg) bg = { r: 11, g: 11, b: 12, a: 1 };
  const comp = { r: fg.r * o + bg.r * (1 - o), g: fg.g * o + bg.g * (1 - o), b: fg.b * o + bg.b * (1 - o) };
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const ratio = (Math.max(L(comp), L(bg)) + 0.05) / (Math.min(L(comp), L(bg)) + 0.05);
  return { sel, disabled: el.disabled === true, ariaLabel: el.getAttribute("aria-label"),
    declared: hex(fg), effectiveOpacity: Math.round(o * 1000) / 1000, bg: hex(bg),
    rendered: hex(comp), ratio: Math.round(ratio * 1000) / 1000, requiredNonText: 3,
    cls: String(el.className || "").slice(0, 120) };
};

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };
  const out = {};

  // ---- 1. the shell clip, and the Clips column with a real campaign -------
  {
    const a = await H.open({ label: "h2-extras-shell", cwd: STUB, outDir: path.join(OUT, "extras-shell"),
      skipSeeded: true, seed: { "clipper.campaigns": [CAMPAIGN], "clipper.activeCampaign": "c1", "clipper.bank": BANK60 } });
    for (const [w, h] of [[1280, 600], [1100, 760], [900, 600], [1280, 800]]) {
      await H.setSize(a, w, h);
      if (w === 1280 && h === 600) { try { await H.loadVideo(a); } catch {} }
      await a.win.waitForTimeout(500);
      const clean = await a.win.evaluate(SHELL_CLIP);
      say(`\n=== shell clip at ${w}x${h}, nothing open ===`);
      say(JSON.stringify(clean, null, 1));
      // Now with Copy blocks open, which is where it showed up.
      await a.win.evaluate(() => document.getElementById("ui-copy-blocks")?.click());
      await a.win.waitForTimeout(700);
      const withPanel = await a.win.evaluate(SHELL_CLIP);
      say(`--- same size, Copy blocks open ---`);
      say(JSON.stringify(withPanel, null, 1));
      await a.shot(`shell-${w}x${h}-copyblocks`);
      await a.win.evaluate(() => document.getElementById("ui-copy-blocks")?.click());
      await a.win.waitForTimeout(400);
      (out.shell ||= []).push({ w, h, clean, withPanel });
    }

    // Clips column with the bank actually populated.
    await H.setSize(a, 1280, 700);
    await a.win.evaluate(() => document.getElementById("clips-tab-bank")?.click());
    await a.win.waitForTimeout(1200);
    const bank = await a.win.evaluate(() => {
      const col = document.getElementById("ui-col-clips");
      const body = col?.querySelector("div.overflow-y-auto") ||
        [...(col?.querySelectorAll("*") || [])].find((e) => /(auto|scroll)/.test(getComputedStyle(e).overflowY));
      const rows = col?.querySelectorAll("li").length ?? 0;
      if (!body) return { rows, scroller: null };
      const s = getComputedStyle(body);
      body.setAttribute("data-h2", "clips");
      return { rows,
        scroller: { what: body.id ? "#" + body.id : body.tagName.toLowerCase() + "." +
            String(body.className || "").split(/\s+/).slice(0, 3).join("."),
          overflowY: s.overflowY, scrollbarWidth: s.scrollbarWidth,
          hiddenY: body.scrollHeight - body.clientHeight,
          gutterY: body.offsetWidth - body.clientWidth,
          tabIndex: body.tabIndex,
          focusablesInside: body.querySelectorAll('button,a[href],input,[tabindex]:not([tabindex="-1"])').length } };
    });
    say(`\n=== Clips column, Bank tab, 60 seeded rows (1280x700) ===`);
    say(JSON.stringify(bank, null, 1));
    if (bank.scroller && bank.scroller.hiddenY > 4) {
      await a.win.mouse.move(1150, 400);
      for (let i = 0; i < 25; i++) { await a.win.mouse.wheel(0, 400); await a.win.waitForTimeout(50); }
      const wheeled = await a.win.evaluate(() => Math.round(document.querySelector('[data-h2="clips"]').scrollTop));
      await a.win.evaluate(() => { document.querySelector('[data-h2="clips"]').scrollTop = 0; document.activeElement?.blur?.(); });
      let tabs = 0, landed = false;
      for (let i = 0; i < 80; i++) {
        await a.win.keyboard.press("Tab"); tabs = i + 1;
        landed = await a.win.evaluate(() => {
          const el = document.querySelector('[data-h2="clips"]');
          return Boolean(el && document.activeElement && (el === document.activeElement || el.contains(document.activeElement)));
        });
        if (landed) break;
      }
      let pd = null;
      if (landed) {
        for (let i = 0; i < 15; i++) { await a.win.keyboard.press("PageDown"); await a.win.waitForTimeout(60); }
        pd = await a.win.evaluate(() => Math.round(document.querySelector('[data-h2="clips"]').scrollTop));
      }
      say(`  wheel -> ${wheeled} of ${bank.scroller.hiddenY};  Tab reached inside after ${tabs} press(es)=${landed};  PageDown -> ${pd}`);
      out.bankReach = { ...bank, wheeled, tabs, landed, pageDown: pd };
    } else out.bankReach = bank;
    await a.shot("clips-bank-60");

    // Truncations in this state, with titles.
    const tr = await a.win.evaluate(TRUNCATIONS);
    say(`\n=== truncated text boxes (bank tab, long campaign name) : ${tr.length} ===`);
    for (const t of tr) {
      say(`  ${t.axis} -${String(t.hiddenPx).padStart(4)}px ellipsis=${t.ellipsis} ownTitle=${t.hasOwnTitle} ` +
        `ancestorTitle=${t.hasAncestorTitle} aria=${t.ariaLabel ? "yes" : "no"}  ${t.what}  "${t.text}"`);
    }
    out.truncations = { bank: tr };

    // The campaign menu's own rows.
    await a.win.evaluate(() => document.getElementById("ui-campaign-chip")?.click());
    await a.win.waitForTimeout(800);
    const tr2 = await a.win.evaluate(TRUNCATIONS);
    say(`\n=== truncated text boxes (campaign menu open) : ${tr2.length} ===`);
    for (const t of tr2.slice(0, 14)) {
      say(`  ${t.axis} -${String(t.hiddenPx).padStart(4)}px ellipsis=${t.ellipsis} ownTitle=${t.hasOwnTitle} ` +
        `ancestorTitle=${t.hasAncestorTitle} aria=${t.ariaLabel ? "yes" : "no"}  ${t.what}  "${t.text}"`);
    }
    out.truncations.campaignMenu = tr2;
    await a.shot("campaign-menu-truncation");

    // The second disabled:opacity-40 control, as a graphic, before a video loads.
    await a.win.keyboard.press("Escape");
    await a.close();
  }

  // ---- 2. the disabled clear button in the In/Out fields -------------------
  {
    const a = await H.open({ label: "h2-extras-graphic", cwd: STUB, outDir: path.join(OUT, "extras-graphic"), skipSeeded: true });
    await H.setSize(a, 1280, 800);
    await a.win.waitForTimeout(800);
    const found = await a.win.evaluate(() => [...document.querySelectorAll("button")]
      .filter((b) => /opacity-40/.test(String(b.className || "")))
      .map((b) => ({ aria: b.getAttribute("aria-label"), disabled: b.disabled,
        cls: String(b.className || "").slice(0, 90),
        hasText: Boolean((b.innerText || "").trim()) })));
    say(`\n=== every control carrying disabled:opacity-40, before a video loads ===`);
    say(JSON.stringify(found, null, 1));
    const graphics = [];
    for (const sel of ['button[aria-label="Reload source"]',
      ...(await a.win.evaluate(() => [...document.querySelectorAll("button")]
        .filter((b) => /opacity-40/.test(String(b.className || "")) && b.getAttribute("aria-label") &&
          b.getAttribute("aria-label") !== "Reload source")
        .map((b) => `button[aria-label="${b.getAttribute("aria-label")}"]`)))]) {
      const g = await a.win.evaluate(GRAPHIC, sel);
      graphics.push(g);
      say(`  ${sel}: ${g.missing ? "missing" : `${g.rendered} on ${g.bg} = ${g.ratio}:1 (opacity ${g.effectiveOpacity}, disabled=${g.disabled})`}`);
    }
    out.graphics = { found, graphics };
    await a.shot("disabled-graphics");
    await a.close();
  }

  // ---- 3. many tabs and the accessibility tree ----------------------------
  for (const n of [1, 5, 25]) {
    const seed = n === 1 ? {} : {
      "clipper.workspaces": { tabs: Array.from({ length: n }, (_, i) => ({ id: `w${i}`, name: `Tab ${i}` })), activeId: `w${n - 1}` },
    };
    let a;
    try {
      a = await H.open({ label: `h2-extras-tabs${n}`, cwd: STUB, outDir: path.join(OUT, `extras-tabs${n}`),
        skipSeeded: true, seed, timeout: 60000 });
      await a.win.waitForTimeout(2500);
      await H.setSize(a, 1280, 800);
      const lm = await a.win.evaluate(LANDMARKS);
      say(`\n=== ${n} tab(s): landmarks and ids ===`);
      say(JSON.stringify(lm, null, 1));
      (out.tabs ||= []).push({ n, ...lm });
      await a.shot(`tabs-${n}`);
    } catch (e) {
      say(`\n=== ${n} tabs: FAILED — ${String(e).slice(0, 160)}`);
    } finally { if (a) await a.close(); }
  }

  fs.writeFileSync(path.join(DATA, "extras.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(DATA, "extras.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "extras.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
