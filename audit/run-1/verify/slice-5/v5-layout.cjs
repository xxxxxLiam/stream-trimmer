/**
 * File: v5-layout.cjs
 * Path: audit/run-1/verify/slice-5/v5-layout.cjs
 * Description: H-3 / H-4 / B-10 verification, written from their own Steps.
 *   For each window size it COLD STARTS the app (fresh user-data dir), loads a
 *   video, and reads the bounding rect of every control the three findings name,
 *   against the viewport height. Also covers:
 *     - the app's own default window size (1100x760) and its own minimum
 *       (900x600 — electron/main.cjs minWidth/minHeight),
 *     - the per-segment drift B-10 claims at 1024x768,
 *     - the same segment count ABOVE the layout's 1160px breakpoint, to find
 *       out whether these are one defect (the wrap) or several,
 *     - real webContents.setZoomFactor, which is what Ctrl+Plus does,
 *     - the help drawer open at 1024x768.
 *
 *   Audit-only; changes no product code.
 */
const { boot, loadVideo, log } = require("./v5-lib.cjs");

const TARGETS = [
  ["#ui-mark-in", "In field"],
  ["#ui-mark-out", "Out field"],
  ["#ui-mark-whole", "Whole video"],
  ["#ui-add-segment", "Add segment"],
  ["#ui-cut", "Cut as one file"],
  ["#ui-stitched-total", "Clip length"],
  ["#ui-col-clips", "Clips column"],
  ["#ui-col-centre", "Centre column"],
];

async function measure(a) {
  return a.win.evaluate((targets) => {
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const out = { vw, vh, dpr: window.devicePixelRatio, items: [] };
    // which layout mode is in force
    const row = document.querySelector("#ui-col-transcript")?.parentElement;
    out.wrapped = row ? getComputedStyle(row).flexWrap === "wrap" : null;
    out.breakpointMatches1160 = window.matchMedia("(min-width: 1160px)").matches;
    for (const [sel, name] of targets) {
      const el = document.querySelector(sel);
      if (!el) { out.items.push({ name, sel, missing: true }); continue; }
      const r = el.getBoundingClientRect();
      out.items.push({
        name,
        sel,
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        fullyBelowFold: r.top >= vh,
        partlyBelowFold: r.bottom > vh + 0.5,
        visibleFraction: Number(
          (Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0)) / Math.max(1, r.height)).toFixed(2),
        ),
      });
    }
    // Is there any on-screen affordance that more exists below?
    const scrollers = [];
    for (const el of document.querySelectorAll("div,section,main,aside")) {
      if (el.scrollHeight - el.clientHeight > 4 && el.clientHeight > 50) {
        const cs = getComputedStyle(el);
        if (cs.overflowY === "auto" || cs.overflowY === "scroll") {
          scrollers.push({
            tag: el.tagName.toLowerCase(),
            id: el.id || null,
            cls: String(el.className).split(/\s+/).slice(0, 3).join("."),
            name: el.getAttribute("aria-label"),
            hiddenPx: el.scrollHeight - el.clientHeight,
            scrollbarGutterPx: el.offsetWidth - el.clientWidth,
            scrollbarWidthCss: cs.scrollbarWidth,
          });
        }
      }
    }
    out.scrollers = scrollers;
    return out;
  }, TARGETS);
}

async function addSegments(a, n) {
  for (let i = 0; i < n; i++) {
    const s = 5 + i * 20;
    const e = s + 7;
    const fmt = (t) =>
      `00:${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
    await a.win.fill("#ui-mark-in", fmt(s));
    await a.win.fill("#ui-mark-out", fmt(e));
    await a.win.click("#ui-add-segment", { force: true });
    await a.win.waitForTimeout(400);
  }
}

function fmt(m, label) {
  const lines = [
    `  ${label}  viewport ${m.vw}x${m.vh}  wrapped=${m.wrapped}  >=1160px=${m.breakpointMatches1160}`,
  ];
  for (const it of m.items) {
    if (it.missing) { lines.push(`    ${it.name.padEnd(16)} MISSING`); continue; }
    const flag = it.fullyBelowFold ? "FULLY BELOW FOLD" : it.partlyBelowFold ? "PART BELOW FOLD" : "visible";
    lines.push(
      `    ${it.name.padEnd(16)} y=${String(it.top).padStart(5)}..${String(it.bottom).padStart(5)} (h${it.height})  ${flag}  visible=${it.visibleFraction}`,
    );
  }
  for (const s of m.scrollers) {
    lines.push(
      `    scroller ${s.tag}#${s.id || "-"}.${s.cls} name=${s.name || "null"} hidden=${s.hiddenPx}px gutter=${s.scrollbarGutterPx}px scrollbar-width=${s.scrollbarWidthCss}`,
    );
  }
  return lines.join("\n");
}

const SIZES = [
  [900, 600, "app MINIMUM window (electron/main.cjs minWidth/minHeight)"],
  [900, 700, "H-3 case"],
  [1024, 768, "H-3/H-4/B-10 case"],
  [1100, 760, "the app's own DEFAULT window size"],
  [1280, 800, "above the 1160px breakpoint"],
  [1440, 900, "13in laptop"],
];

(async () => {
  const runLabel = process.argv[2] || "1";

  for (const [w, h, why] of SIZES) {
    const a = await boot(`layout-${w}x${h}-r${runLabel}`, { viewport: { width: w, height: h } });
    await a.win.waitForTimeout(900);
    const empty = await measure(a);
    await loadVideo(a);
    await a.win.waitForTimeout(1500);
    const m = await measure(a);
    log(`\n### ${w}x${h} — ${why}`);
    log(fmt(empty, "empty workspace, no video"));
    log(fmt(m, "video loaded, 0 segments"));
    await a.shot(`${w}x${h}-0seg`);
    await a.close();
  }

  // B-10's per-segment claim at 1024x768, and the same thing above the breakpoint.
  for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900]]) {
    const a = await boot(`layout-seg-${w}x${h}-r${runLabel}`, { viewport: { width: w, height: h } });
    await loadVideo(a);
    log(`\n### per-segment drift at ${w}x${h}`);
    await a.win.waitForTimeout(1200);
    for (let n = 0; n <= 5; n++) {
      if (n > 0) await addSegments(a, 1);
      await a.win.waitForTimeout(600);
      const m = await measure(a);
      const cut = m.items.find((i) => i.name === "Cut as one file");
      log(`  ${n} segment(s): cut y=${cut.top}..${cut.bottom} vh=${m.vh} -> ${cut.fullyBelowFold ? "FULLY BELOW" : cut.partlyBelowFold ? "PART BELOW" : "visible"}`);
    }
    await a.shot(`${w}x${h}-5seg`);
    await a.close();
  }

  // Help drawer open at 1024x768 (H-3's first row).
  {
    const a = await boot(`layout-help-1024x768-r${runLabel}`, { viewport: { width: 1024, height: 768 } });
    await loadVideo(a);
    await a.win.click("#ui-help-button");
    await a.win.waitForTimeout(700);
    const m = await measure(a);
    log(`\n### 1024x768 with the Help drawer open`);
    log(fmt(m, "help open"));
    await a.shot("help-1024x768");
    await a.close();
  }

  // Real page zoom, which is what Ctrl+Plus does.
  for (const [w, h, z] of [[1440, 900, 1.5], [1280, 800, 1.5], [1280, 800, 2.0]]) {
    const a = await boot(`layout-zoom${z}-${w}x${h}-r${runLabel}`, { viewport: { width: w, height: h } });
    await loadVideo(a);
    await a.app.evaluate(({ BrowserWindow }, zoom) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.setZoomFactor(zoom);
      }
    }, z);
    await a.win.waitForTimeout(900);
    const m = await measure(a);
    log(`\n### ${w}x${h} at ${z * 100}% real page zoom`);
    log(fmt(m, `zoom ${z}`));
    await a.shot(`zoom${z}-${w}x${h}`);
    await a.close();
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
