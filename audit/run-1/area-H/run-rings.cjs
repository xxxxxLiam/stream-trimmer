/**
 * File: run-rings.cjs
 * Path: audit/run-1/area-H/run-rings.cjs
 * Description: Area H pass 5 — the focus indicator of the two text-input
 *   families read pixel row by pixel row, including the 1px border row the
 *   coarser pass skipped, plus a scrollbar inventory at every size and the
 *   overlap list. Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot, script } = require("./lib/stub.cjs");
const { setSize, inject, loadShot } = require("./lib/drive.cjs");
const { URL_OK, jsClick, closeAll } = require("./lib/states.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB_OK = path.join(SCRATCH, "stubH-ok");
const BASE = "/home/user/stream-trimmer/audit/run-1/area-H/out";
const DATA = path.join(BASE, "data");

const lum = (c) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b); };
const hx = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
const cr = (a, b) => Math.round(((Math.max(lum(hx(a)), lum(hx(b))) + 0.05) / (Math.min(lum(hx(a)), lum(hx(b))) + 0.05)) * 100) / 100;

async function rows(a, sel, label) {
  const there = await a.win.evaluate((s) => Boolean(document.querySelector(s)), sel);
  if (!there) { console.log(`${label}: absent`); return { label, sel, present: false }; }
  await a.win.evaluate((s) => {
    const p = document.createElement("button");
    p.id = "__hp"; p.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px";
    document.body.appendChild(p); p.focus();
  }, sel);
  await a.win.keyboard.press("Tab");
  await a.win.evaluate((s) => {
    const el = document.querySelector(s);
    (el.tagName === "INPUT" ? el : el.querySelector("input") || el).focus();
  }, sel);
  await a.win.waitForTimeout(280);
  await inject(a.win); await loadShot(a);
  const out = await a.win.evaluate((s) => {
    const el = document.querySelector(s);
    const r = el.getBoundingClientRect();
    const x1 = r.left + r.width * 0.3, x2 = r.left + r.width * 0.7;
    const bands = {};
    for (let o = -6; o <= 3; o++) bands["y" + o] = window.__H.stripColor(x1, x2, Math.round(r.top + o));
    return { bands, cs: (() => { const c = getComputedStyle(el); return { outline: `${c.outlineStyle} ${c.outlineWidth} ${c.outlineColor}`, boxShadow: c.boxShadow, borderColor: c.borderColor, borderWidth: c.borderTopWidth }; })() };
  }, sel);
  await a.win.evaluate(() => document.getElementById("__hp")?.remove());
  const page = out.bands.y_far || out.bands["y-6"];
  const list = Object.entries(out.bands).map(([k, v]) => [k, v && v.hex]);
  const best = list.filter(([k]) => k !== "y-6").reduce((acc, [k, h]) => {
    if (!h || !page) return acc;
    const c = cr(h, page.hex);
    return !acc || c > acc.contrast ? { row: k, hex: h, contrast: c } : acc;
  }, null);
  console.log(`${label.padEnd(26)} rows ${list.map(([k, h]) => `${k}:${h}`).join(" ")}`);
  console.log(`${"".padEnd(26)} page=${page && page.hex} strongest=${best && best.hex}@${best && best.row} = ${best && best.contrast}:1 (need 3)  css: ${JSON.stringify(out.cs)}`);
  return { label, sel, present: true, bands: Object.fromEntries(list), pageHex: page && page.hex, strongest: best, css: out.cs };
}

(async () => {
  buildStubRoot(STUB_OK);
  script(STUB_OK, { authFail: false, exitCode: 0, delayMs: 0, info: { id: "stub0000001", title: "Stub video", duration: 3600, uploader: "Stub channel" } });
  fs.mkdirSync(DATA, { recursive: true });
  const report = { rings: [], scrollbars: [], overlaps: [] };

  const a = await launch({ label: "H-rings", cwd: STUB_OK, outDir: path.join(BASE, "rings"), signedIn: true, seed: {} });
  await a.win.waitForTimeout(7000);
  await setSize(a, 1440, 900);
  await inject(a.win);

  console.log("=== focus indicator, row by row (y0 = the control's own top border) ===");
  report.rings.push(await rows(a, "#ui-source-chip > div", "URL bar wrapper"));
  await a.win.fill('input[type="url"]', URL_OK);
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(4500);
  report.rings.push(await rows(a, "#ui-mark-in", ".field (In timecode)"));
  report.rings.push(await rows(a, "#ui-mark-out", ".field (Out timecode)"));
  report.rings.push(await rows(a, "#ui-mark-whole", "button (Whole video)"));
  await jsClick(a.win, "#ui-help-button");
  await a.win.waitForTimeout(600);
  report.rings.push(await rows(a, "#help-search", ".field (help search)"));
  await closeAll(a.win);

  console.log("\n=== scrollbar inventory ===");
  for (const [w, h] of [[900, 700], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]]) {
    await setSize(a, w, h);
    await inject(a.win);
    const bars = await a.win.evaluate(() => window.__H.scrollers().map((s) => ({
      path: s.path, id: s.id, visibleBar: s.visibleBar, gutterY: s.gutterY, gutterX: s.gutterX,
      hiddenY: s.hiddenY, hiddenX: s.hiddenX, overflowY: s.overflowY, overflowX: s.overflowX,
      scrollbarWidthCss: s.scrollbarWidthCss,
    })));
    report.scrollbars.push({ size: `${w}x${h}`, bars });
    console.log(`${w}x${h}: ${bars.filter((b) => b.visibleBar).length} visible of ${bars.length} scrollable`);
    for (const b of bars.filter((x) => x.visibleBar)) console.log(`    ${b.gutterY || b.gutterX}px bar, ${b.hiddenY || b.hiddenX}px hidden  ${b.id ? "#" + b.id : b.path}`);
  }

  // Overlays that overlap controls.
  await setSize(a, 1440, 900);
  for (const [name, sel] of [["symbol palette", "#ui-symbols"], ["copy blocks", "#ui-copy-blocks"], ["campaign popover", "#ui-campaign-chip"]]) {
    await closeAll(a.win);
    await jsClick(a.win, sel);
    await a.win.waitForTimeout(700);
    await inject(a.win);
    const ov = await a.win.evaluate(() => window.__H.overlaps());
    report.overlaps.push({ name, count: ov.length, sample: ov.slice(0, 6) });
    console.log(`\noverlaps with ${name} open: ${ov.length}`);
    for (const o of ov.slice(0, 6)) console.log(`   ${o.a.tag}${o.a.id ? "#" + o.a.id : ""} "${(o.a.text || o.a.ariaLabel || "").slice(0, 20)}" <> ${o.b.tag}${o.b.id ? "#" + o.b.id : ""} "${(o.b.text || o.b.ariaLabel || "").slice(0, 20)}" ${JSON.stringify(o.overlap)}`);
  }

  fs.writeFileSync(path.join(DATA, "rings.json"), JSON.stringify(report, null, 2));
  console.log("\nwrote", path.join(DATA, "rings.json"));
  await a.close();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
