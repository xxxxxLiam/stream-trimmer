/**
 * File: probe.js
 * Path: audit/run-1/area-H/lib/probe.js
 * Description: Area H's in-page measurement kit. Injected into the running app
 *   and evaluated there, so every number is read off the real rendered DOM and
 *   the real rendered pixels — never inferred from source. Audit-only.
 *
 *   Backgrounds are taken from an actual screenshot handed back into the page
 *   and drawn on a canvas, so gradients, shadows, tints and overlay alpha are
 *   all accounted for. Text colour is taken from the computed style with every
 *   ancestor opacity composited in, which is exact.
 */
/* eslint-disable */
(() => {
  const H = {};

  // ---- colour -----------------------------------------------------------
  const parse = (css) => {
    if (!css) return null;
    const m = String(css).match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
    if (p.length < 3 || p.some((n) => Number.isNaN(n))) return null;
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const hex = (c) =>
    "#" + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
  const over = (fg, bg) => ({
    r: fg.r * fg.a + bg.r * (1 - fg.a),
    g: fg.g * fg.a + bg.g * (1 - fg.a),
    b: fg.b * fg.a + bg.b * (1 - fg.a),
    a: 1,
  });
  const lum = (c) => {
    const f = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const ratio = (a, b) => {
    const la = lum(a), lb = lum(b);
    return Math.round(((Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)) * 100) / 100;
  };
  H.parse = parse; H.hex = hex; H.ratio = ratio; H.over = over;

  // ---- element description ---------------------------------------------
  const cssPath = (el) => {
    const parts = [];
    let n = el;
    while (n && n.nodeType === 1 && parts.length < 5) {
      let s = n.tagName.toLowerCase();
      if (n.id) { parts.unshift(s + "#" + n.id); break; }
      const cls = (n.getAttribute("class") || "").trim().split(/\s+/).filter(Boolean).slice(0, 3);
      if (cls.length) s += "." + cls.join(".");
      parts.unshift(s);
      n = n.parentElement;
    }
    return parts.join(" > ");
  };
  const describe = (el) => {
    if (!el || el.nodeType !== 1) return null;
    const r = el.getBoundingClientRect();
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id || null,
      cls: (el.getAttribute("class") || "").slice(0, 120) || null,
      role: el.getAttribute("role") || null,
      type: el.getAttribute("type") || null,
      text: (el.innerText || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 70) || null,
      ariaLabel: el.getAttribute("aria-label"),
      ariaLabelledby: el.getAttribute("aria-labelledby"),
      title: el.getAttribute("title"),
      ariaExpanded: el.getAttribute("aria-expanded"),
      ariaPressed: el.getAttribute("aria-pressed"),
      ariaHidden: el.getAttribute("aria-hidden"),
      disabled: el.disabled === true || el.getAttribute("aria-disabled") === "true",
      path: cssPath(el),
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    };
  };
  H.describe = describe;

  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === "none" || s.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const effOpacity = (el) => {
    let o = 1, n = el;
    while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity || "1"); n = n.parentElement; }
    return o;
  };
  /** CSS-composited background, plus whether a gradient was in the stack. */
  const cssBg = (el) => {
    let acc = null, grad = false, n = el;
    const stack = [];
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.backgroundImage && s.backgroundImage !== "none") grad = true;
      const c = parse(s.backgroundColor);
      if (c && c.a > 0) stack.push(c);
      if (c && c.a >= 1) break;
      n = n.parentElement;
    }
    stack.push({ r: 11, g: 11, b: 12, a: 1 }); // --c-bg, the page floor
    acc = stack[stack.length - 1];
    for (let i = stack.length - 2; i >= 0; i--) acc = over(stack[i], acc);
    return { color: acc, gradient: grad };
  };

  // ---- the screenshot canvas -------------------------------------------
  let CANVAS = null, CTX = null, SCALE = 1;
  H.loadShot = async (dataUrl) => {
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    CANVAS = document.createElement("canvas");
    CANVAS.width = img.naturalWidth; CANVAS.height = img.naturalHeight;
    CTX = CANVAS.getContext("2d", { willReadFrequently: true });
    CTX.drawImage(img, 0, 0);
    SCALE = img.naturalWidth / window.innerWidth;
    return { w: img.naturalWidth, h: img.naturalHeight, scale: SCALE };
  };

  /**
   * Histogram of real pixels inside a viewport rect, dropping pixels close to
   * `skip` (the glyphs). Returns colours by share of the area.
   */
  const sample = (rect, skip) => {
    if (!CTX) return null;
    const x = Math.max(0, Math.round(rect.x * SCALE));
    const y = Math.max(0, Math.round(rect.y * SCALE));
    const w = Math.min(CANVAS.width - x, Math.round(rect.w * SCALE));
    const h = Math.min(CANVAS.height - y, Math.round(rect.h * SCALE));
    if (w <= 0 || h <= 0) return null;
    const d = CTX.getImageData(x, y, w, h).data;
    const counts = new Map();
    let total = 0;
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (skip) {
        const dist = Math.abs(r - skip.r) + Math.abs(g - skip.g) + Math.abs(b - skip.b);
        if (dist < 150) continue; // glyph core + its antialiasing
      }
      const k = (r << 16) | (g << 8) | b;
      counts.set(k, (counts.get(k) || 0) + 1);
      total++;
    }
    if (!total) return null;
    const list = [...counts.entries()]
      .map(([k, n]) => ({ c: { r: (k >> 16) & 255, g: (k >> 8) & 255, b: k & 255, a: 1 }, share: n / total }))
      .sort((a, b) => b.share - a.share);
    return { list, total };
  };
  H.sample = sample;

  // ---- 1. contrast of every text node ----------------------------------
  H.textContrast = () => {
    const out = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const t = (node.nodeValue || "").trim();
      if (!t) continue;
      const el = node.parentElement;
      if (!el) continue;
      if (["SCRIPT", "STYLE", "TITLE"].includes(el.tagName)) continue;
      if (!visible(el)) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      const rects = [...range.getClientRects()].filter((r) => r.width > 1 && r.height > 1);
      if (!rects.length) continue;
      const r0 = rects[0];
      if (r0.bottom < 0 || r0.top > window.innerHeight || r0.right < 0 || r0.left > window.innerWidth) continue;

      const s = getComputedStyle(el);
      const fg0 = parse(s.color) || { r: 255, g: 255, b: 255, a: 1 };
      const op = effOpacity(el);
      const bgInfo = cssBg(el);

      const px = sample({ x: r0.left, y: r0.top, w: r0.width, h: r0.height }, fg0);
      let bgPixel = null, bgWorst = null;
      if (px) {
        bgPixel = px.list[0].c;
        let worst = null, worstR = Infinity;
        const fgComposited = over({ ...fg0, a: fg0.a * op }, px.list[0].c);
        for (const e of px.list) {
          if (e.share < 0.02) break;
          const rr = ratio(fgComposited, e.c);
          if (rr < worstR) { worstR = rr; worst = e.c; }
        }
        bgWorst = worst;
      }
      const bgUse = bgPixel || bgInfo.color;
      const fg = over({ ...fg0, a: fg0.a * op }, bgUse);
      // Cross-check against the pure-CSS background. A glyph-dense box (a big
      // symbol, an icon font) can fool the pixel histogram, so only a failure
      // on BOTH readings is reported as confirmed.
      const fgCss = over({ ...fg0, a: fg0.a * op }, bgInfo.color);
      const ratioCss = ratio(fgCss, bgInfo.color);
      const size = parseFloat(s.fontSize);
      const weight = parseInt(s.fontWeight, 10) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      const rr = ratio(fg, bgUse);
      const rWorst = bgWorst ? ratio(fg, bgWorst) : rr;
      out.push({
        text: t.slice(0, 60),
        path: cssPath(el),
        id: el.id || null,
        color: s.color, colorHex: hex(fg), opacity: Math.round(op * 100) / 100,
        bgPixelHex: bgPixel ? hex(bgPixel) : null,
        bgCssHex: hex(bgInfo.color),
        bgGradient: bgInfo.gradient,
        bgWorstHex: bgWorst ? hex(bgWorst) : null,
        fontSize: size, fontWeight: weight, large,
        ratio: rr, ratioWorst: rWorst, ratioCss, need,
        pass: rr >= need,
        bothFail: rr < need && ratioCss < need,
        rect: { x: Math.round(r0.left), y: Math.round(r0.top), w: Math.round(r0.width), h: Math.round(r0.height) },
      });
    }
    return out;
  };

  // ---- 1b. icon-only controls vs their background -----------------------
  H.iconContrast = () => {
    const out = [];
    const nodes = document.querySelectorAll("button, a[href], [role=button], summary");
    for (const el of nodes) {
      if (!visible(el)) continue;
      const txt = (el.innerText || "").trim();
      const svg = el.querySelector("svg");
      if (txt || !svg) continue; // icon-only means no visible text
      const s = getComputedStyle(svg);
      const fill = parse(s.color) || parse(s.fill);
      if (!fill) continue;
      const r = svg.getBoundingClientRect();
      const bgInfo = cssBg(el);
      const px = sample({ x: r.left, y: r.top, w: r.width, h: r.height }, fill);
      const bg = px ? px.list[0].c : bgInfo.color;
      const fg = over({ ...fill, a: fill.a * effOpacity(el) }, bg);
      out.push({
        ...describe(el),
        iconColor: hex(fg), bgHex: hex(bg), bgCssHex: hex(bgInfo.color),
        ratio: ratio(fg, bg), need: 3, pass: ratio(fg, bg) >= 3,
      });
    }
    return out;
  };

  // ---- 2/3. focusables, names, semantics -------------------------------
  const FOCUSABLE =
    'a[href], button, input, select, textarea, summary, [tabindex], [contenteditable="true"]';
  H.focusables = () =>
    [...document.querySelectorAll(FOCUSABLE)]
      .filter((el) => visible(el) && !el.disabled && el.getAttribute("tabindex") !== "-1")
      .map(describe);

  /** Interactive elements that keyboard cannot reach at all. */
  H.unreachable = () =>
    [...document.querySelectorAll("[onclick], [role=button], [role=menuitem], [role=tab], [role=option]")]
      .filter((el) => visible(el) && !el.matches(FOCUSABLE) && el.getAttribute("tabindex") === null)
      .map(describe);

  H.semantics = () => {
    const issues = [];
    const named = (el) => {
      const t = (el.innerText || "").trim();
      const al = el.getAttribute("aria-label");
      const lb = el.getAttribute("aria-labelledby");
      const ti = el.getAttribute("title");
      const sr = el.querySelector(".sr-only, .visually-hidden");
      return Boolean(t || al || (lb && document.getElementById(lb.split(" ")[0])) || ti || sr);
    };
    for (const el of document.querySelectorAll("button, a[href], [role=button]")) {
      if (!visible(el)) continue;
      if (!named(el)) issues.push({ kind: "control-no-accessible-name", ...describe(el) });
    }
    for (const el of document.querySelectorAll("img")) {
      if (!el.hasAttribute("alt") && el.getAttribute("aria-hidden") !== "true")
        issues.push({ kind: "img-no-alt", ...describe(el) });
    }
    for (const el of document.querySelectorAll("svg")) {
      if (!visible(el)) continue;
      const host = el.closest("button, a, [role=button], [role=img]");
      const labelled = el.getAttribute("aria-hidden") === "true" ||
        el.getAttribute("role") === "img" && (el.getAttribute("aria-label") || el.querySelector("title")) ||
        (host && (host.getAttribute("aria-label") || (host.innerText || "").trim()));
      if (!labelled && !host) issues.push({ kind: "svg-not-hidden-not-labelled", ...describe(el) });
    }
    for (const el of document.querySelectorAll("input, select, textarea")) {
      if (!visible(el)) continue;
      if (["hidden", "submit", "button"].includes(el.type)) continue;
      const lab = el.labels && el.labels.length > 0;
      const ok = lab || el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.getAttribute("title");
      if (!ok) issues.push({ kind: "form-control-no-label", placeholder: el.placeholder || null, ...describe(el) });
    }
    const heads = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")].filter(visible);
    const levels = heads.map((h) => ({ level: +h.tagName[1], text: (h.innerText || "").trim().slice(0, 50) }));
    let prev = 0;
    for (const h of levels) {
      if (prev && h.level > prev + 1) issues.push({ kind: "heading-skip", from: prev, to: h.level, text: h.text });
      prev = h.level;
    }
    if (heads.length === 0) issues.push({ kind: "no-headings" });
    else if (levels[0].level !== 1) issues.push({ kind: "no-h1", firstLevel: levels[0].level, text: levels[0].text });

    const landmarks = {
      main: document.querySelectorAll("main, [role=main]").length,
      nav: document.querySelectorAll("nav, [role=navigation]").length,
      header: document.querySelectorAll("header, [role=banner]").length,
      footer: document.querySelectorAll("footer, [role=contentinfo]").length,
      search: document.querySelectorAll("[role=search]").length,
      complementary: document.querySelectorAll("aside, [role=complementary]").length,
    };
    const live = [...document.querySelectorAll("[aria-live], [role=status], [role=alert], [role=log], [role=progressbar]")]
      .filter(visible).map(describe);
    return { issues, headings: levels, landmarks, live };
  };

  // ---- 4. layout --------------------------------------------------------
  H.layout = () => {
    const vw = window.innerWidth, vh = window.innerHeight;
    const doc = document.documentElement;
    const hScroll = doc.scrollWidth > vw + 1 || document.body.scrollWidth > vw + 1;
    const offRight = [];
    const clipped = [];
    const belowFold = [];
    for (const el of document.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.right > vw + 1 && r.left < vw) offRight.push({ ...describe(el), overflowPx: Math.round(r.right - vw) });
      const s = getComputedStyle(el);
      const truncH = el.scrollWidth > el.clientWidth + 1 && (s.textOverflow === "ellipsis" || s.overflowX === "hidden");
      const truncV = el.scrollHeight > el.clientHeight + 1 && s.overflowY === "hidden";
      const srOnly = /(^|\s)(sr-only|visually-hidden)(\s|$)/.test(el.getAttribute("class") || "");
      if ((truncH || truncV) && !srOnly && (el.innerText || "").trim()) {
        clipped.push({
          ...describe(el),
          axis: truncH ? "x" : "y",
          hiddenPx: truncH ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight,
          hasTitle: Boolean(el.getAttribute("title") || el.closest("[title]")),
          ellipsis: s.textOverflow === "ellipsis",
        });
      }
      if (r.top >= vh - 2 && r.height > 4) belowFold.push(describe(el));
    }
    return { vw, vh, hScroll, scrollWidth: doc.scrollWidth, offRight: offRight.slice(0, 60), clipped: clipped.slice(0, 80) };
  };

  /** Is this selector's element fully inside the viewport? */
  H.where = (sel) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, present: false };
    const r = el.getBoundingClientRect();
    return {
      sel, present: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      vh: window.innerHeight, vw: window.innerWidth,
      fullyVisible: r.top >= 0 && r.bottom <= window.innerHeight && r.left >= 0 && r.right <= window.innerWidth,
      belowFold: r.top >= window.innerHeight,
      partlyBelow: r.bottom > window.innerHeight && r.top < window.innerHeight,
      // How far you must scroll the nearest scroller to see it.
      scrollerOverflow: (() => {
        let n = el.parentElement;
        while (n) {
          const s = getComputedStyle(n);
          if (/(auto|scroll)/.test(s.overflowY) && n.scrollHeight > n.clientHeight + 1) {
            return { path: cssPath(n), hidden: n.scrollHeight - n.clientHeight };
          }
          n = n.parentElement;
        }
        return null;
      })(),
    };
  };

  /**
   * The controls the job cannot be done without. Reports, for each, whether it
   * is on screen and how much scrolling stands between the user and it.
   */
  H.CRITICAL = [
    ["#ui-mark-in", "Mark in"],
    ["#ui-mark-out", "Mark out"],
    ["#ui-mark-whole", "Whole video"],
    ["#ui-add-segment", "Add segment"],
    ["#ui-cut", "Cut as one file"],
    ["#ui-stitched-total", "Clip length readout"],
    ["#ui-col-clips", "Clips column"],
    ["#ui-col-transcript", "Transcript column"],
    ["#ui-source-chip", "URL bar"],
    ["#ui-footer-clips", "Clips folder chip"],
    ["#ui-help-button", "Help"],
    ["footer", "Footer"],
  ];
  H.critical = () => H.CRITICAL.map(([sel, label]) => ({ label, ...H.where(sel) }));

  /** Interactive controls whose boxes overlap each other. */
  H.overlaps = () => {
    const els = [...document.querySelectorAll("button, a[href], input, select, textarea")].filter(visible);
    const out = [];
    for (let i = 0; i < els.length; i++) {
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i], b = els[j];
        if (a.contains(b) || b.contains(a)) continue;
        const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect();
        const ox = Math.min(ra.right, rb.right) - Math.max(ra.left, rb.left);
        const oy = Math.min(ra.bottom, rb.bottom) - Math.max(ra.top, rb.top);
        if (ox > 2 && oy > 2) out.push({ a: describe(a), b: describe(b), overlap: { x: Math.round(ox), y: Math.round(oy) } });
      }
    }
    return out.slice(0, 40);
  };

  // ---- 6. scrollbars ----------------------------------------------------
  H.scrollers = () => {
    const out = [];
    const all = [document.documentElement, document.body, ...document.querySelectorAll("*")];
    const seen = new Set();
    for (const el of all) {
      if (seen.has(el)) continue;
      seen.add(el);
      if (el.nodeType !== 1) continue;
      const s = getComputedStyle(el);
      const oy = s.overflowY, ox = s.overflowX;
      const scrollableY = el.scrollHeight > el.clientHeight + 1 && /(auto|scroll)/.test(oy);
      const scrollableX = el.scrollWidth > el.clientWidth + 1 && /(auto|scroll)/.test(ox);
      if (!scrollableY && !scrollableX) continue;
      const barW = el.offsetWidth - el.clientWidth - (parseFloat(s.borderLeftWidth) + parseFloat(s.borderRightWidth));
      const barH = el.offsetHeight - el.clientHeight - (parseFloat(s.borderTopWidth) + parseFloat(s.borderBottomWidth));
      out.push({
        ...describe(el),
        overflowY: oy, overflowX: ox,
        scrollableY, scrollableX,
        hiddenY: el.scrollHeight - el.clientHeight,
        hiddenX: el.scrollWidth - el.clientWidth,
        gutterY: Math.round(barW), gutterX: Math.round(barH),
        visibleBar: Math.round(barW) > 0 || Math.round(barH) > 0,
        scrollbarWidthCss: s.scrollbarWidth || "auto",
        tabIndex: el.tabIndex,
      });
    }
    return out;
  };

  // ---- 7. token consistency --------------------------------------------
  H.tokens = () => {
    const radii = new Map(), sizes = new Map(), colors = new Map(), bgs = new Map(), gaps = new Map(), pads = new Map();
    const bump = (m, k, el) => {
      if (!m.has(k)) m.set(k, { n: 0, eg: [] });
      const e = m.get(k); e.n++;
      if (e.eg.length < 4) e.eg.push(cssPath(el));
    };
    for (const el of document.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el);
      for (const corner of ["borderTopLeftRadius", "borderTopRightRadius", "borderBottomLeftRadius", "borderBottomRightRadius"]) {
        const v = s[corner];
        if (v && v !== "0px") bump(radii, v, el);
      }
      if ((el.innerText || "").trim()) bump(sizes, s.fontSize, el);
      const c = parse(s.color);
      if (c && (el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim())))
        bump(colors, hex(c) + (c.a < 1 ? `@${c.a}` : ""), el);
      const bc = parse(s.backgroundColor);
      if (bc && bc.a > 0) bump(bgs, hex(bc) + (bc.a < 1 ? `@${Math.round(bc.a * 100)}%` : ""), el);
      if (s.gap && s.gap !== "normal" && s.gap !== "0px") bump(gaps, s.gap, el);
      for (const p of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) {
        if (s[p] && s[p] !== "0px") bump(pads, s[p], el);
      }
    }
    const dump = (m) => [...m.entries()].map(([k, v]) => ({ value: k, count: v.n, examples: v.eg })).sort((a, b) => b.count - a.count);
    return { radii: dump(radii), fontSizes: dump(sizes), textColors: dump(colors), backgrounds: dump(bgs), gaps: dump(gaps), paddings: dump(pads) };
  };

  // ---- 8. motion --------------------------------------------------------
  H.motion = () => {
    const animated = [];
    for (const el of document.querySelectorAll("*")) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el);
      const hasTransition = s.transitionDuration && s.transitionDuration !== "0s" &&
        !/^0s(,\s*0s)*$/.test(s.transitionDuration);
      const hasAnimation = s.animationName && s.animationName !== "none";
      if (hasTransition || hasAnimation) {
        animated.push({
          ...describe(el),
          transition: hasTransition ? `${s.transitionProperty} ${s.transitionDuration}` : null,
          animation: hasAnimation ? `${s.animationName} ${s.animationDuration} ${s.animationIterationCount}` : null,
        });
      }
    }
    // Does any stylesheet mention the media query at all?
    let rmRules = 0;
    for (const sheet of document.styleSheets) {
      try {
        for (const rule of sheet.cssRules) {
          if (rule.conditionText && /prefers-reduced-motion/.test(rule.conditionText)) rmRules++;
          if (rule.media && /prefers-reduced-motion/.test(rule.media.mediaText)) rmRules++;
        }
      } catch { /* cross-origin sheet */ }
    }
    return { animated: animated.slice(0, 60), animatedCount: animated.length, reducedMotionRules: rmRules };
  };

  window.__H = H;
  return true;
})();
