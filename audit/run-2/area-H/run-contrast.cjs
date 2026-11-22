/**
 * File: run-contrast.cjs
 * Path: audit/run-2/area-H/run-contrast.cjs
 * Description: H-1 and the full token/contrast sweep, re-measured.
 *
 *   H-1 half: the disabled Reload label is measured from the COMPUTED styles of
 *   the running app — declared colour, every ancestor opacity multiplied in, the
 *   first opaque ancestor background composited under it — and then the WCAG 2.x
 *   relative-luminance arithmetic is printed term by term, so the number can be
 *   checked by hand. A second, independent reading comes from the real painted
 *   pixels (a Playwright screenshot handed back into the page and histogrammed).
 *
 *   Sweep half: every visible text node in every reachable state, with the token
 *   inventory (radii, type sizes, text colours) per state, as run 1 did — this
 *   is a regression check on a system run 1 found in good shape (one off-token
 *   colour in 1,795 nodes).
 *
 *   Audit-only; no product code is touched.
 */
const fs = require("node:fs");
const path = require("node:path");
const { buildStubRoot, script } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");
const { measure } = require("./lib/drive.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

/** My own WCAG 2.x implementation, written here rather than reused, printed term by term. */
const WCAG = (sel) => {
  const parse = (css) => {
    const m = String(css || "").match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const hex = (c) => "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  const el = document.querySelector(sel);
  if (!el) return { sel, missing: true };
  const s = getComputedStyle(el);
  const declared = parse(s.color);
  // Every ancestor opacity, named, so the chain can be audited.
  const chain = [];
  let o = 1, n = el;
  while (n && n.nodeType === 1) {
    const op = parseFloat(getComputedStyle(n).opacity || "1");
    if (op < 1) chain.push({ el: (n.id ? "#" + n.id : n.tagName.toLowerCase()) +
      (n.getAttribute("aria-label") ? `[${n.getAttribute("aria-label")}]` : ""), opacity: op });
    o *= op;
    n = n.parentElement;
  }
  // First opaque ancestor background.
  let bg = null, bgFrom = null;
  n = el;
  while (n && n.nodeType === 1) {
    const c = parse(getComputedStyle(n).backgroundColor);
    if (c && c.a >= 1) { bg = c; bgFrom = n.id ? "#" + n.id : n.tagName.toLowerCase() + "." +
      String(n.className || "").split(/\s+/).filter(Boolean).slice(0, 2).join("."); break; }
    n = n.parentElement;
  }
  if (!bg) { bg = { r: 11, g: 11, b: 12, a: 1 }; bgFrom = "--c-bg floor"; }
  const rendered = {
    r: declared.r * declared.a * o + bg.r * (1 - declared.a * o),
    g: declared.g * declared.a * o + bg.g * (1 - declared.a * o),
    b: declared.b * declared.a * o + bg.b * (1 - declared.a * o),
  };
  const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const L = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const Lt = L(rendered), Lb = L(bg);
  const ratio = (Math.max(Lt, Lb) + 0.05) / (Math.min(Lt, Lb) + 0.05);
  const size = parseFloat(s.fontSize), weight = parseInt(s.fontWeight, 10) || 400;
  return {
    sel,
    text: (el.innerText || "").trim().slice(0, 40),
    disabledAttr: el.disabled === true, ariaDisabled: el.getAttribute("aria-disabled"),
    className: String(el.className || "").slice(0, 120),
    declaredColor: s.color, declaredHex: hex(declared),
    opacityChain: chain, effectiveOpacity: Math.round(o * 1000) / 1000,
    bgFrom, bgHex: hex(bg),
    renderedHex: hex(rendered), renderedRgb: [Math.round(rendered.r), Math.round(rendered.g), Math.round(rendered.b)],
    fontSizePx: size, fontWeight: weight,
    terms: {
      lin_text: [Math.round(lin(rendered.r) * 1e6) / 1e6, Math.round(lin(rendered.g) * 1e6) / 1e6, Math.round(lin(rendered.b) * 1e6) / 1e6],
      lin_bg: [Math.round(lin(bg.r) * 1e6) / 1e6, Math.round(lin(bg.g) * 1e6) / 1e6, Math.round(lin(bg.b) * 1e6) / 1e6],
      L_text: Math.round(Lt * 1e6) / 1e6, L_bg: Math.round(Lb * 1e6) / 1e6,
    },
    ratio: Math.round(ratio * 1000) / 1000,
    requiredAA: size >= 24 || (size >= 18.66 && weight >= 700) ? 3 : 4.5,
  };
};

/** Pixel cross-check: histogram the label's own box out of a real screenshot. */
const PIXELS = (sel) => {
  const el = document.querySelector(sel);
  if (!el) return null;
  const node = [...el.childNodes].find((n) => n.nodeType === 3 && n.nodeValue.trim()) || el.firstChild;
  let rect;
  if (node && node.nodeType === 3) {
    const rg = document.createRange(); rg.selectNodeContents(node);
    const rs = [...rg.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
    rect = rs[0] || el.getBoundingClientRect();
  } else rect = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  const m = String(s.color).match(/rgba?\(([^)]+)\)/);
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  const px = window.__H.sample({ x: rect.left, y: rect.top, w: rect.width, h: rect.height }, null);
  if (!px) return null;
  const top = px.list.slice(0, 8).map((e) => ({ hex: window.__H.hex(e.c), share: Math.round(e.share * 1000) / 1000 }));
  // The glyph core is the darkest/lightest colour far from the background.
  const bg = px.list[0].c;
  let glyph = null, far = -1;
  for (const e of px.list) {
    const d = Math.abs(e.c.r - bg.r) + Math.abs(e.c.g - bg.g) + Math.abs(e.c.b - bg.b);
    if (d > far && e.share > 0.004) { far = d; glyph = e.c; }
  }
  return {
    sampled: px.total, distinct: px.list.length, topColors: top,
    bgHex: window.__H.hex(bg), glyphHex: glyph ? window.__H.hex(glyph) : null,
    ratio: glyph ? window.__H.ratio(glyph, bg) : null,
    declaredColor: `rgb(${p.slice(0, 3).join(",")})`,
  };
};

const STATES = [
  { name: "workspace-empty", open: async () => {} },
  { name: "video-loaded", video: true, open: async () => {} },
  { name: "video-loading", open: async (a) => {
      script(STUB, { delayMs: 9000 });
      await a.win.fill('input[type="url"]', H.URL_OK);
      await a.win.keyboard.press("Enter");
      await a.win.waitForTimeout(1200);
    } },
  { name: "video-error", open: async (a) => {
      script(STUB, { exitCode: 1, stderr: "ERROR: [youtube] abc: Video unavailable" });
      await a.win.fill('input[type="url"]', H.URL_OK);
      await a.win.keyboard.press("Enter");
      await a.win.waitForTimeout(3000);
    } },
  { name: "settings-popover", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-settings")?.click()); } },
  { name: "campaign-popover", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-campaign-chip")?.click()); } },
  { name: "copy-blocks", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-copy-blocks")?.click()); } },
  { name: "symbol-palette", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-symbols")?.click()); } },
  { name: "help-drawer", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-help-button")?.click()); } },
  { name: "setup-checklist", video: true, open: async (a) => {
      await a.win.evaluate(() => document.getElementById("ui-help-button")?.click());
      await a.win.waitForTimeout(600);
      await a.win.evaluate(() => document.getElementById("help-setup-toggle")?.click());
    } },
  { name: "footer-format-popover", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-footer-format")?.click()); } },
  { name: "footer-data-popover", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-footer-data")?.click()); } },
  { name: "session-chip-menu", video: true, open: async (a) => {
      await a.win.evaluate(() => {
        const b = [...document.querySelectorAll("header button")].find((x) => /signed in|not signed|expire/i.test(x.innerText || ""));
        b?.click();
      });
    } },
  { name: "clips-tab-bank", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("clips-tab-bank")?.click()); } },
  { name: "clips-tab-all", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("clips-tab-all")?.click()); } },
  { name: "segment-added", video: true, segments: 2, open: async () => {} },
  { name: "import-timestamps", video: true, open: async (a) => {
      await a.win.evaluate(() => document.getElementById("clips-tab-bank")?.click());
      await a.win.waitForTimeout(500);
      await a.win.evaluate(() => {
        const b = [...document.querySelectorAll("button")].find((x) => /import timestamps/i.test(x.innerText || ""));
        b?.click();
      });
    } },
];

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };
  const out = { h1: [], states: [] };

  // ---- 1. H-1: the disabled Reload label, computed and from pixels ---------
  {
    const a = await H.open({ label: "h2-h1", cwd: STUB, outDir: path.join(OUT, "h1"), skipSeeded: true });
    await H.setSize(a, 1280, 800);
    await H.inject(a.win);
    const RELOAD = 'button[aria-label="Reload source"]';
    const present = await a.win.evaluate((s) => Boolean(document.querySelector(s)), RELOAD);
    say(`\n===== H-1: the disabled Reload control (${RELOAD}) present=${present} =====`);
    const buf = await a.win.screenshot();
    await a.win.evaluate((u) => window.__H.loadShot(u), "data:image/png;base64," + buf.toString("base64"));
    const w = await a.win.evaluate(WCAG, RELOAD);
    const px = await a.win.evaluate(PIXELS, RELOAD);
    say(JSON.stringify(w, null, 2));
    say("pixel cross-check: " + JSON.stringify(px));
    await a.shot("urlbar-disabled");
    out.h1.push({ state: "disabled", wcag: w, pixels: px });

    // The Loading state: the same label reads "Loading" while a fetch runs.
    script(STUB, { delayMs: 9000 });
    await a.win.fill('input[type="url"]', H.URL_OK);
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(1500);
    await H.inject(a.win);
    const buf2 = await a.win.screenshot();
    await a.win.evaluate((u) => window.__H.loadShot(u), "data:image/png;base64," + buf2.toString("base64"));
    const w2 = await a.win.evaluate(WCAG, RELOAD);
    const px2 = await a.win.evaluate(PIXELS, RELOAD);
    say(`\n--- the same control in the LOADING state ---`);
    say(JSON.stringify(w2, null, 2));
    say("pixel cross-check: " + JSON.stringify(px2));
    await a.shot("urlbar-loading");
    out.h1.push({ state: "loading", wcag: w2, pixels: px2 });

    // Correctly-tokenised disabled controls on the same screen, for comparison.
    script(STUB, { delayMs: 0 });
    const peers = await a.win.evaluate(() => {
      const res = [];
      for (const el of document.querySelectorAll("button:disabled, input:disabled, [aria-disabled=true]")) {
        const r = el.getBoundingClientRect();
        if (r.width < 2 || r.height < 2) continue;
        const s = getComputedStyle(el);
        res.push({
          what: el.id ? "#" + el.id : (el.getAttribute("aria-label") || (el.innerText || "").trim().slice(0, 24) || el.tagName),
          color: s.color, opacity: s.opacity, cls: String(el.className || "").slice(0, 80),
        });
      }
      return res;
    });
    say("\n--- every disabled control on this screen, with its colour and own opacity ---");
    for (const p of peers) say(`    ${String(p.what).padEnd(28)} color=${p.color} opacity=${p.opacity}`);
    out.h1.push({ peers });

    // And each of them through the same arithmetic.
    const peerRatios = [];
    for (const sel of ["#ui-mark-whole", "#ui-cut", "#ui-add-segment", "#ui-mark-in"]) {
      const r = await a.win.evaluate(WCAG, sel);
      if (!r.missing) { peerRatios.push(r); say(`    ${sel.padEnd(18)} ${r.renderedHex} on ${r.bgHex} = ${r.ratio}:1  (opacity ${r.effectiveOpacity})`); }
    }
    out.h1.push({ peerRatios });
    await a.close();
  }

  // ---- 2. the full sweep ---------------------------------------------------
  for (const st of STATES) {
    let a;
    try {
      script(STUB, { exitCode: 0, delayMs: 0, stderr: "" });
      a = await H.open({ label: `h2-c-${st.name}`, cwd: STUB, outDir: path.join(OUT, `contrast-${st.name}`), skipSeeded: true });
      await H.setSize(a, 1280, 800);
      if (st.video) await H.loadVideo(a);
      if (st.segments) await H.addSegments(a, st.segments);
      await st.open(a);
      await a.win.waitForTimeout(900);
      const m = await measure(a, st.name);
      const tokens = await a.win.evaluate(() => window.__H.tokens());
      const shot = await a.shot(st.name);
      const fails = m.text.filter((t) => t.bothFail);
      const iconFails = m.icons.filter((i) => !i.pass);
      out.states.push({ ...m, tokens, shot, failCount: fails.length });
      say(`\n${st.name.padEnd(24)} nodes=${String(m.text.length).padStart(4)}  ` +
        `bothFail=${fails.length}  iconFail=${iconFails.length}  ` +
        `radii=[${tokens.radii.map((r) => r.value).join(" ")}]  ` +
        `sizes=[${tokens.fontSizes.map((r) => r.value).join(" ")}]`);
      for (const f of fails) {
        say(`    FAIL ${f.ratio}:1 (css ${f.ratioCss}:1) need ${f.need}  ${f.colorHex} on ${f.bgPixelHex}/${f.bgCssHex}  ` +
          `${f.fontSize}px/${f.fontWeight}  "${f.text}"  ${f.path}`);
      }
      for (const f of iconFails) say(`    ICON ${f.ratio}:1  ${f.iconColor} on ${f.bgHex}  ${f.ariaLabel || f.path}`);
      say(`    text colours: ${tokens.textColors.map((c) => `${c.value}x${c.count}`).join(" ")}`);
    } catch (e) {
      say(`\n${st.name}: FAILED — ${String(e).slice(0, 200)}`);
    } finally { if (a) await a.close(); }
  }

  fs.writeFileSync(path.join(DATA, "contrast.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(DATA, "contrast.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "contrast.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
