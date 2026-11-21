/**
 * File: run-regressions.cjs
 * Path: audit/run-2/area-H/run-regressions.cjs
 * Description: The regression hunt around each fix, plus the zoom levels run 1
 *   only reached briefly.
 *
 *   - duplicate ids and the accessibility tree, after T10 added eleven new
 *     help-catalogue ids: every id in the document counted, the CDP AX tree
 *     dumped, unnamed interactive nodes listed, landmarks and headings counted.
 *   - the sign-in modal's inert / aria-hidden handling, and whether the
 *     background can still be driven from the keyboard behind the scrim.
 *   - real page zoom at 125 / 150 / 175 / 200 % through webContents.setZoomFactor
 *     (the Ctrl+Plus path) on the app's own default window and on its minimum,
 *     with 0 and 2 segments: where the critical controls land, whether the
 *     container query still gives three columns, and whether anything becomes
 *     unreachable.
 *   - a base-font probe (html { font-size } — what an OS "larger text" setting does).
 *
 *   Audit-only; no product code is touched.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");
const { inject } = require("./lib/drive.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

const IDS_AND_TREE = () => {
  const counts = new Map();
  for (const el of document.querySelectorAll("[id]")) {
    const id = el.id;
    if (!counts.has(id)) counts.set(id, []);
    counts.get(id).push(el.tagName.toLowerCase() + (el.getAttribute("aria-label") ? `[${el.getAttribute("aria-label")}]` : ""));
  }
  const dupes = [...counts.entries()].filter(([, v]) => v.length > 1).map(([id, v]) => ({ id, count: v.length, nodes: v }));
  // Every aria-labelledby / aria-controls / aria-describedby / label[for] target must exist.
  const danglers = [];
  for (const attr of ["aria-labelledby", "aria-controls", "aria-describedby", "aria-activedescendant"]) {
    for (const el of document.querySelectorAll(`[${attr}]`)) {
      for (const ref of (el.getAttribute(attr) || "").split(/\s+/).filter(Boolean)) {
        if (!document.getElementById(ref)) {
          danglers.push({ attr, ref, on: el.id ? "#" + el.id : el.tagName.toLowerCase() + "." +
            String(el.className || "").split(/\s+/).slice(0, 2).join(".") });
        }
      }
    }
  }
  for (const lab of document.querySelectorAll("label[for]")) {
    const f = lab.getAttribute("for");
    if (f && !document.getElementById(f)) danglers.push({ attr: "for", ref: f, on: "label" });
  }
  const headings = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")]
    .filter((h) => { const s = getComputedStyle(h); return s.display !== "none" && s.visibility !== "hidden"; })
    .map((h) => ({ level: +h.tagName[1], text: (h.innerText || "").trim().slice(0, 50) }));
  return {
    totalIds: counts.size,
    duplicates: dupes,
    danglingRefs: danglers,
    helpIds: [...counts.keys()].filter((k) => /^(help-anchor-|ui-)/.test(k)).sort(),
    headings,
    h1Count: document.querySelectorAll("h1").length,
    landmarks: {
      main: document.querySelectorAll("main,[role=main]").length,
      nav: document.querySelectorAll("nav,[role=navigation]").length,
      banner: document.querySelectorAll("header,[role=banner]").length,
      contentinfo: document.querySelectorAll("footer,[role=contentinfo]").length,
      region: document.querySelectorAll("[role=region],section[aria-label]").length,
      search: document.querySelectorAll("[role=search]").length,
      complementary: document.querySelectorAll("aside,[role=complementary]").length,
    },
    // A region with tabindex=0 and no name would be a stray tab stop.
    namelessRegions: [...document.querySelectorAll("[role=region]")]
      .filter((e) => !e.getAttribute("aria-label") && !e.getAttribute("aria-labelledby"))
      .map((e) => e.tagName.toLowerCase() + "." + String(e.className || "").split(/\s+/).slice(0, 2).join(".")),
  };
};

const MODAL_STATE = () => {
  const dlg = document.querySelector('[role="dialog"]');
  const main = document.querySelector("main");
  const root = document.getElementById("root");
  const q = (el) => el ? { ariaHidden: el.getAttribute("aria-hidden"), inert: el.hasAttribute("inert"),
    inertProp: el.inert === true } : null;
  const focusables = (scope) => [...scope.querySelectorAll(
    'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])')]
    .filter((e) => { const s = getComputedStyle(e); const r = e.getBoundingClientRect();
      return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; });
  return {
    dialogPresent: Boolean(dlg),
    role: dlg?.getAttribute("role") || null,
    ariaModal: dlg?.getAttribute("aria-modal") || null,
    ariaLabelledby: dlg?.getAttribute("aria-labelledby") || null,
    main: q(main), root: q(root),
    inertInDocument: document.querySelectorAll("[inert]").length,
    ariaHiddenInDocument: document.querySelectorAll('[aria-hidden="true"]').length,
    focusablesInsideDialog: dlg ? focusables(dlg).length : 0,
    focusablesOutsideDialog: focusables(document.body).filter((e) => !dlg || !dlg.contains(e)).length,
    activeElement: document.activeElement === document.body ? "body"
      : (document.activeElement?.id ? "#" + document.activeElement.id
        : document.activeElement?.getAttribute("aria-label") || document.activeElement?.tagName),
    activeInsideDialog: dlg ? dlg.contains(document.activeElement) : null,
  };
};

const ZOOM_TARGETS = [
  ["#ui-mark-in", "In field"], ["#ui-mark-out", "Out field"], ["#ui-mark-whole", "Whole video"],
  ["#ui-add-segment", "Add segment"], ["#ui-cut", "Cut"], ["#ui-stitched-total", "Stitched total"],
  ["#ui-col-clips", "Clips col"], ["#ui-source-chip", "URL bar"], ["#ui-help-button", "Help"],
  ["#ui-segment-list", "Segment list"],
];

const ZOOM_MEASURE = (targets) => {
  const vw = window.innerWidth, vh = window.innerHeight;
  const row = document.querySelector(".cols-row");
  const cutRow = document.getElementById("ui-cut-row");
  const items = [];
  for (const [sel, name] of targets) {
    const el = document.querySelector(sel);
    if (!el) { items.push({ name, missing: true }); continue; }
    const r = el.getBoundingClientRect();
    const pts = [];
    for (const fx of [0.15, 0.5, 0.85]) for (const fy of [0.25, 0.5, 0.75]) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy;
      if (x < 0 || y < 0 || x > vw || y > vh) { pts.push("OFFSCREEN"); continue; }
      const hit = document.elementFromPoint(x, y);
      if (!hit) { pts.push("NONE"); continue; }
      if (hit === el || el.contains(hit) || hit.contains(el)) pts.push("OK");
      else { const anc = hit.closest("[id]"); pts.push("COVERED:" + (anc?.id ? "#" + anc.id : hit.tagName.toLowerCase())); }
    }
    const cov = pts.filter((p) => p.startsWith("COVERED"));
    items.push({ name, t: Math.round(r.top), b: Math.round(r.bottom),
      fullyBelow: r.top >= vh, partlyBelow: r.bottom > vh && r.top < vh,
      verdict: pts.every((p) => p === "OK") ? "OK" : pts.every((p) => p === "OFFSCREEN") ? "OFFSCREEN"
        : cov.length === 9 ? "FULLY-COVERED" : cov.length ? "PART-COVERED" : "PART-OFFSCREEN",
      coveredBy: [...new Set(cov.map((c) => c.slice(8)))] });
  }
  return {
    vw, vh, dpr: window.devicePixelRatio,
    wrapped: row ? getComputedStyle(row).flexWrap !== "nowrap" : null,
    cutRowPosition: cutRow ? getComputedStyle(cutRow).position : null,
    hScroll: document.documentElement.scrollWidth > vw + 1,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyFontPx: getComputedStyle(document.body).fontSize,
    items,
  };
};

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };
  const out = { ids: [], modal: {}, zoom: [], baseFont: null };

  // ---- 1. ids and the accessibility tree, in several states ---------------
  {
    const a = await H.open({ label: "h2-ids", cwd: STUB, outDir: path.join(OUT, "ids"), skipSeeded: true,
      seed: { "clipper.campaigns": [{ id: "c1", name: "Acme Q4", targetMinSec: 30, targetMaxSec: 60,
        hardMaxSec: 90, clipIdPattern: "{prefix}{nn}", prefix: "A", format: "mp4", quality: "best",
        clipsDir: "", dataDir: "", usedRanges: [] }], "clipper.activeCampaign": "c1",
        "clipper.bank": { c1: { stub0000001: [{ id: "A001", label: "Row one", segments: [{ start: 5, end: 20 }], status: "banked" }] } } } });
    await H.setSize(a, 1440, 900);
    const states = [
      ["empty", async () => {}],
      ["video-loaded", async () => { await H.loadVideo(a); }],
      ["segments-2", async () => { await H.addSegments(a, 2); }],
      ["help-drawer", async () => { await a.win.evaluate(() => document.getElementById("ui-help-button")?.click()); }],
      ["setup-checklist", async () => { await a.win.evaluate(() => document.getElementById("help-setup-toggle")?.click()); }],
      ["symbols+copyblocks", async () => {
        await a.win.evaluate(() => { document.getElementById("ui-symbols")?.click(); });
        await a.win.waitForTimeout(400);
        await a.win.evaluate(() => { document.getElementById("ui-copy-blocks")?.click(); });
      }],
      ["bank-tab", async () => { await a.win.evaluate(() => document.getElementById("clips-tab-bank")?.click()); }],
    ];
    for (const [name, go] of states) {
      await go();
      await a.win.waitForTimeout(800);
      const r = await a.win.evaluate(IDS_AND_TREE);
      out.ids.push({ state: name, ...r });
      say(`\n=== ids / tree: ${name} ===`);
      say(`  ids=${r.totalIds}  duplicates=${r.duplicates.length}  danglingRefs=${r.danglingRefs.length}  h1=${r.h1Count}`);
      for (const d of r.duplicates) say(`  DUPLICATE id="${d.id}" x${d.count}: ${d.nodes.join(" , ")}`);
      for (const d of r.danglingRefs) say(`  DANGLING ${d.attr}="${d.ref}" on ${d.on}`);
      say(`  headings: ${JSON.stringify(r.headings)}`);
      say(`  landmarks: ${JSON.stringify(r.landmarks)}`);
      if (r.namelessRegions.length) say(`  nameless role=region: ${r.namelessRegions.join(" , ")}`);
      await a.shot(`ids-${name}`);
    }
    // The CDP accessibility tree: unnamed interactive nodes.
    const cdp = await a.win.context().newCDPSession(a.win);
    await cdp.send("Accessibility.enable");
    const tree = await cdp.send("Accessibility.getFullAXTree");
    const INTERACTIVE = new Set(["button", "link", "textbox", "combobox", "tab", "slider", "checkbox",
      "radio", "menuitem", "switch", "searchbox", "spinbutton", "option"]);
    const roles = {};
    const unnamed = [];
    for (const n of tree.nodes) {
      const role = n.role?.value;
      if (!role) continue;
      roles[role] = (roles[role] || 0) + 1;
      if (INTERACTIVE.has(role) && !(n.name?.value || "").trim() && n.ignored !== true) {
        unnamed.push({ role, backendId: n.backendDOMNodeId, props: (n.properties || []).map((p) => p.name).join(",") });
      }
    }
    say(`\n=== CDP accessibility tree (bank tab, drawer + panels open) ===`);
    say(`  roles: ${JSON.stringify(roles)}`);
    say(`  unnamed interactive nodes: ${unnamed.length}${unnamed.length ? " -> " + JSON.stringify(unnamed.slice(0, 12)) : ""}`);
    out.axTree = { roles, unnamed };
    await a.close();
  }

  // ---- 2. the sign-in modal: inert / aria-hidden, and the live background --
  {
    const a = await H.open({ label: "h2-modal", cwd: STUB, outDir: path.join(OUT, "modal"), keepGate: true });
    await H.setSize(a, 1280, 800);
    await a.win.waitForTimeout(5000);
    await inject(a.win);
    const st = await a.win.evaluate(MODAL_STATE);
    say(`\n=== sign-in modal, background handling ===`);
    say(JSON.stringify(st, null, 2));
    // 40 Tab presses: how many land outside the dialog?
    await a.win.evaluate(() => { document.activeElement?.blur?.(); });
    const stops = [];
    for (let i = 0; i < 40; i++) {
      await a.win.keyboard.press("Tab");
      stops.push(await a.win.evaluate(() => {
        const el = document.activeElement;
        if (!el || el === document.body) return { body: true };
        const dlg = document.querySelector('[role="dialog"]');
        return { what: el.id ? "#" + el.id : (el.getAttribute("aria-label") || (el.innerText || "").trim().slice(0, 22) || el.tagName),
          inside: dlg ? dlg.contains(el) : false };
      }));
    }
    const outside = stops.filter((s) => !s.body && !s.inside);
    say(`  Tab x40: ${stops.filter((s) => s.inside).length} inside the dialog, ${outside.length} outside, ${stops.filter((s) => s.body).length} on <body>`);
    say(`  reached outside: ${[...new Set(outside.map((s) => s.what))].join(" , ")}`);
    // Can the background actually be driven from behind the scrim?
    const drive = await a.win.evaluate(() => {
      const s = document.getElementById("ui-settings");
      s?.focus(); return { focused: document.activeElement === s };
    });
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(500);
    const driven = await a.win.evaluate(() => ({
      settingsExpanded: document.getElementById("ui-settings")?.getAttribute("aria-expanded"),
      bodyHasSettingsText: document.body.innerText.includes("No app settings yet"),
      modalStillUp: Boolean(document.querySelector('[role="dialog"]')),
    }));
    say(`  driving the background from the keyboard: ${JSON.stringify({ ...drive, ...driven })}`);
    const esc = await (async () => {
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(400);
      return a.win.evaluate(() => Boolean(document.querySelector('[role="dialog"]')));
    })();
    say(`  dialog still present after Escape: ${esc}`);
    await a.shot("signin-modal");
    out.modal = { state: st, stops, outsideCount: outside.length, driven, escapeClosed: !esc };
    await a.close();
  }

  // ---- 3. real page zoom ---------------------------------------------------
  for (const [w, h, why] of [[1100, 760, "the app's own default window"], [900, 600, "the app's own minimum"], [1440, 900, "13in laptop"]]) {
    const a = await H.open({ label: `h2-zoom-${w}x${h}`, cwd: STUB, outDir: path.join(OUT, `zoom-${w}x${h}`), skipSeeded: true });
    await H.setSize(a, Math.max(w, 1280), Math.max(h, 820));
    await H.loadVideo(a);
    say(`\n=== real page zoom at ${w}x${h} (${why}) ===`);
    let added = 0;
    for (const segs of [0, 2]) {
      if (segs > added) {
        await H.setSize(a, Math.max(w, 1280), Math.max(h, 820));
        await H.setZoom(a, 1);
        await H.addSegments(a, segs - added);
        added = segs;
      }
      for (const z of [1, 1.25, 1.5, 1.75, 2]) {
        await H.setZoom(a, 1);
        await H.setSize(a, w, h);
        const got = await H.setZoom(a, z);
        await a.win.waitForTimeout(500);
        const m = await a.win.evaluate(ZOOM_MEASURE, ZOOM_TARGETS);
        out.zoom.push({ w, h, segs, zoom: z, got, ...m });
        say(`  zoom ${String(z * 100).padStart(3)}%  CSS viewport ${m.vw}x${m.vh}  wrapped=${m.wrapped} ` +
          `cutRow=${m.cutRowPosition} hScroll=${m.hScroll} (docScrollW ${m.docScrollWidth}) segs=${segs}`);
        for (const it of m.items) {
          if (it.missing) continue;
          if (it.verdict !== "OK") {
            say(`      ${it.name.padEnd(15)} y ${String(it.t).padStart(5)}..${String(it.b).padStart(5)}  ${it.verdict}` +
              `${it.coveredBy.length ? " by " + it.coveredBy.join(",") : ""}`);
          }
        }
        const bad = m.items.filter((i) => !i.missing && i.verdict !== "OK").length;
        if (bad === 0) say(`      all ${m.items.filter((i) => !i.missing).length} critical controls OK`);
        if (z === 1.5 || z === 2) await a.shot(`zoom${z * 100}-${w}x${h}-${segs}seg`);
      }
    }
    await H.setZoom(a, 1);
    await a.close();
  }

  // ---- 4. base font size (what an OS "larger text" setting does) ----------
  {
    const a = await H.open({ label: "h2-basefont", cwd: STUB, outDir: path.join(OUT, "basefont"), skipSeeded: true });
    await H.setSize(a, 1280, 800);
    await H.loadVideo(a);
    const before = await a.win.evaluate(() => ({
      root: getComputedStyle(document.documentElement).fontSize,
      body: getComputedStyle(document.body).fontSize,
      heading: (() => { const h = document.querySelector("h2"); return h ? getComputedStyle(h).fontSize : null; })(),
      cut: (() => { const c = document.getElementById("ui-cut"); return c ? getComputedStyle(c).fontSize : null; })(),
    }));
    await a.win.evaluate(() => { document.documentElement.style.fontSize = "24px"; });
    await a.win.waitForTimeout(600);
    const after = await a.win.evaluate(() => ({
      root: getComputedStyle(document.documentElement).fontSize,
      body: getComputedStyle(document.body).fontSize,
      heading: (() => { const h = document.querySelector("h2"); return h ? getComputedStyle(h).fontSize : null; })(),
      cut: (() => { const c = document.getElementById("ui-cut"); return c ? getComputedStyle(c).fontSize : null; })(),
      anyRem: (() => {
        // Does any visible element use a rem-based size at all?
        let n = 0;
        for (const el of document.querySelectorAll("*")) {
          const s = getComputedStyle(el);
          if (s.fontSize && !/px$/.test(s.fontSize)) n++;
        }
        return n;
      })(),
    }));
    say(`\n=== base font probe (html { font-size: 24px }) ===`);
    say(`  before: ${JSON.stringify(before)}`);
    say(`  after : ${JSON.stringify(after)}`);
    out.baseFont = { before, after };
    await a.shot("basefont-24px");
    await a.close();
  }

  fs.writeFileSync(path.join(DATA, "regressions.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(DATA, "regressions.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "regressions.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
