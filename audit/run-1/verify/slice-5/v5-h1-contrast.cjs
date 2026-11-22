/**
 * File: v5-h1-contrast.cjs
 * Path: audit/run-1/verify/slice-5/v5-h1-contrast.cjs
 * Description: H-1 verification. Recomputes the contrast of the disabled Reload
 *   button's label FROM THE COMPUTED STYLES OF THE RUNNING APP, independently of
 *   area H's probe: it composites every ancestor `opacity` into the text colour,
 *   walks the ancestor chain for the first opaque background, and prints the
 *   WCAG 2.x relative-luminance formula step by step. A second reading samples
 *   the real painted pixels by handing a Playwright screenshot back into the
 *   page and reading it off a canvas.
 *
 *   Also measures the "correctly tokenised" disabled controls the finding
 *   compares against, so the claim that this one control is the outlier can be
 *   checked rather than taken on trust.
 *
 *   Audit-only; changes no product code.
 */
const { boot, loadVideo, setStub, log, URL1 } = require("./v5-lib.cjs");

const PROBE = String.raw`
(() => {
  // ---- WCAG 2.x, written out here rather than imported from anywhere ----
  const chan = (v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  const lum = ([r, g, b]) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  };
  const parse = (s) => {
    const m = String(s).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    return { rgb: [p[0], p[1], p[2]], a: p.length > 3 ? p[3] : 1 };
  };
  const over = (fg, bg, a) => fg.map((c, i) => Math.round(a * c + (1 - a) * bg[i]));
  const hex = (rgb) => "#" + rgb.map((c) => c.toString(16).padStart(2, "0").toUpperCase()).join("");

  /** Cumulative opacity of el and every ancestor. */
  const chainOpacity = (el) => {
    let o = 1, n = el, steps = [];
    while (n && n.nodeType === 1) {
      const v = parseFloat(getComputedStyle(n).opacity);
      if (!Number.isNaN(v) && v < 1) {
        o *= v;
        steps.push({ el: n.tagName.toLowerCase() + (n.getAttribute("aria-label") ? "[" + n.getAttribute("aria-label") + "]" : ""), opacity: v });
      }
      n = n.parentElement;
    }
    return { opacity: o, steps };
  };

  /** First opaque background up the chain, with any translucent layers composited. */
  const effectiveBg = (el) => {
    const layers = [];
    let n = el.nodeType === 1 ? el : el.parentElement;
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n);
      const bg = parse(cs.backgroundColor);
      if (bg && bg.a > 0) {
        layers.push({ el: n.tagName.toLowerCase() + (n.className && typeof n.className === "string" ? "." + n.className.split(/\s+/).slice(0, 2).join(".") : ""), color: cs.backgroundColor, alpha: bg.a });
        if (bg.a >= 1) break;
      }
      n = n.parentElement;
    }
    // bottom-up composite
    let out = [11, 11, 12];
    for (let i = layers.length - 1; i >= 0; i--) {
      const l = parse(layers[i].color);
      out = over(l.rgb, out, l.a);
    }
    return { rgb: out, layers };
  };

  const report = (label, el) => {
    if (!el) return { label, missing: true };
    const cs = getComputedStyle(el);
    const col = parse(cs.color);
    const op = chainOpacity(el);
    const bg = effectiveBg(el.parentElement || el);
    // the text's own alpha and the inherited opacity both apply
    const a = col.a * op.opacity;
    const rendered = over(col.rgb, bg.rgb, a);
    const r = el.getBoundingClientRect();
    return {
      label,
      text: (el.textContent || "").trim().slice(0, 40),
      declaredColor: cs.color,
      declaredColorHex: hex(col.rgb),
      fontSizePx: cs.fontSize,
      fontWeight: cs.fontWeight,
      opacityChain: op,
      effectiveAlpha: Number(a.toFixed(4)),
      bgLayers: bg.layers,
      bgHex: hex(bg.rgb),
      renderedHex: hex(rendered),
      renderedRgb: rendered,
      lumText: Number(lum(rendered).toFixed(6)),
      lumBg: Number(lum(bg.rgb).toFixed(6)),
      contrast: Number(ratio(rendered, bg.rgb).toFixed(3)),
      rect: { top: Math.round(r.top), left: Math.round(r.left), w: Math.round(r.width), h: Math.round(r.height) },
      disabledAncestor: !!el.closest("[disabled],:disabled"),
    };
  };

  const q = (s) => document.querySelector(s);
  const out = { cases: [] };

  // The finding's own target.
  const reloadBtn = q('button[aria-label="Reload source"]');
  out.cases.push(report("Reload label span (disabled)", reloadBtn && reloadBtn.querySelector("span")));
  out.reloadDisabled = reloadBtn ? reloadBtn.disabled : null;
  out.reloadClass = reloadBtn ? reloadBtn.className : null;

  // Every element in the document whose rendered text colour is produced by a
  // sub-1 opacity chain, so the claim "18 occurrences / every screen" can be
  // checked rather than assumed.
  const dimmed = [];
  for (const el of document.querySelectorAll("*")) {
    if (!el.childNodes.length) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) continue;
    const op = chainOpacity(el);
    if (op.opacity >= 0.999) continue;
    const rep = report("dimmed:" + el.tagName.toLowerCase(), el);
    dimmed.push({ text: rep.text, contrast: rep.contrast, renderedHex: rep.renderedHex, bgHex: rep.bgHex, alpha: rep.effectiveAlpha, fontSizePx: rep.fontSizePx });
  }
  out.dimmedTextNodes = dimmed;

  // Controls that use the disabled TOKEN (#909092) rather than opacity, for the
  // comparison the finding makes.
  const tokened = [];
  for (const el of document.querySelectorAll("*")) {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText) continue;
    const cs = getComputedStyle(el);
    const p = parse(cs.color);
    if (!p) continue;
    if (hex(p.rgb) !== "#909092") continue;
    const rep = report("token:" + el.tagName.toLowerCase(), el);
    tokened.push({ text: rep.text, contrast: rep.contrast, renderedHex: rep.renderedHex, bgHex: rep.bgHex });
  }
  out.disabledTokenNodes = tokened;
  return out;
})()
`;

/** Pixel cross-check: hand the screenshot back into the page, read it off a canvas. */
async function PIXELS(args) {
  {
  const { dataUrl, rect, dpr } = args;
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  c.getContext("2d").drawImage(img, 0, 0);
  const x0 = Math.max(0, Math.floor(rect.left * dpr));
  const y0 = Math.max(0, Math.floor(rect.top * dpr));
  const w = Math.max(1, Math.ceil(rect.w * dpr));
  const h = Math.max(1, Math.ceil(rect.h * dpr));
  const d = c.getContext("2d").getImageData(x0, y0, w, h).data;
  const counts = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const k = d[i] + "," + d[i + 1] + "," + d[i + 2];
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const chan = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
  const lum = ([r, g, b]) => 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b);
  const hex = (rgb) => "#" + rgb.map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");
  const bg = sorted[0][0].split(",").map(Number);
  const lbg = lum(bg);
  // the glyph core = the pixel colour furthest in luminance from the modal bg
  let glyph = bg, best = 0;
  for (const [k, n] of sorted) {
    if (n < 2) continue;
    const rgb = k.split(",").map(Number);
    const dist = Math.abs(lum(rgb) - lbg);
    if (dist > best) { best = dist; glyph = rgb; }
  }
  const lg = lum(glyph);
  const ratio = (Math.max(lg, lbg) + 0.05) / (Math.min(lg, lbg) + 0.05);
  return {
    sampledPx: w * h,
    distinctColours: sorted.length,
    bgHex: hex(bg), bgCount: sorted[0][1],
    glyphHex: hex(glyph),
    top5: sorted.slice(0, 5).map(([k, n]) => ({ hex: hex(k.split(",").map(Number)), n })),
    pixelContrast: Number(ratio.toFixed(3)),
  };
  }
}

async function once(run) {
  const a = await boot(`h1-contrast-${run}`);
  const res = {};
  res.beforePaste = await a.win.evaluate(PROBE);
  const shot1 = await a.shot("urlbar-disabled");

  // pixel cross-check on the Reload label
  const rect = res.beforePaste.cases[0].rect;
  const buf = await a.win.screenshot();
  const dpr = await a.win.evaluate(() => window.devicePixelRatio);
  res.pixels = await a.win.evaluate(PIXELS, {
    dataUrl: "data:image/png;base64," + buf.toString("base64"),
    rect: { left: rect.left, top: rect.top, w: rect.w, h: rect.h },
    dpr,
  });

  // The "Loading" state the finding leans on: is the word really the only
  // signal that the app is working, or is there a second one beside it?
  setStub({ delayMs: 9000 });
  await a.win.locator('#ui-source-chip input[type="url"]').fill(URL1);
  await a.win.keyboard.press("Enter");
  await a.win
    .waitForFunction(
      () => {
        const b = document.querySelector('button[aria-label="Reload source"] span');
        return b && b.textContent.trim() === "Loading";
      },
      null,
      { timeout: 15000 },
    )
    .catch(() => {});
  res.loadingState = await a.win.evaluate(PROBE);
  res.loadingExtras = await a.win.evaluate(() => {
    const spin = document.querySelector("#ui-source-chip svg.animate-spin");
    const cs = spin ? getComputedStyle(spin) : null;
    return {
      spinnerPresent: !!spin,
      spinnerColour: cs ? cs.color : null,
      spinnerAnimation: cs ? cs.animationName : null,
      reloadLabel: (document.querySelector('button[aria-label="Reload source"] span') || {}).textContent,
      otherLoadingText: document.body.innerText
        .split("\n")
        .map((s) => s.trim())
        .filter((s) => /load|fetch|work|wait/i.test(s))
        .slice(0, 6),
    };
  });
  const shot2 = await a.shot("urlbar-loading");
  setStub({ delayMs: 0 });
  await a.close();
  return { res, shot1, shot2 };
}

(async () => {
  const runs = [];
  for (const n of [1, 2]) {
    const { res, shot1, shot2 } = await once(n);
    const c = res.beforePaste.cases[0];
    log(`\n=== run ${n} ===`);
    log("reload button disabled:", res.beforePaste.reloadDisabled);
    log("declared colour:", c.declaredColor, c.declaredColorHex, "size", c.fontSizePx, "weight", c.fontWeight);
    log("opacity chain:", JSON.stringify(c.opacityChain));
    log("effective alpha:", c.effectiveAlpha);
    log("bg layers:", JSON.stringify(c.bgLayers));
    log("effective background:", c.bgHex);
    log("RENDERED colour:", c.renderedHex, c.renderedRgb);
    log("relative luminance text:", c.lumText, " bg:", c.lumBg);
    log("WCAG contrast (CSS composite):", c.contrast + ":1");
    log("pixel reading:", JSON.stringify(res.pixels));
    log("dimmed text nodes on this screen:", res.beforePaste.dimmedTextNodes.length);
    for (const d of res.beforePaste.dimmedTextNodes) log("   ", JSON.stringify(d));
    log("#909092 disabled-token nodes on this screen:", res.beforePaste.disabledTokenNodes.length);
    for (const d of res.beforePaste.disabledTokenNodes) log("   ", JSON.stringify(d));
    log("shot:", shot1);
    const L = res.loadingState.cases[0];
    log("-- Loading state --");
    log("label:", JSON.stringify(res.loadingExtras));
    log("Loading rendered:", L.renderedHex, "on", L.bgHex, "contrast", L.contrast + ":1", "alpha", L.effectiveAlpha);
    log("shot:", shot2);
    runs.push({ contrast: c.contrast, rendered: c.renderedHex, pixel: res.pixels.pixelContrast });
  }
  log("\n=== SUMMARY ===");
  log(JSON.stringify(runs, null, 2));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
