/**
 * File: run-keyboard2.cjs
 * Path: audit/run-1/area-H/run-keyboard2.cjs
 * Description: Area H pass 3b — the keyboard pass redone in the state a
 *   clipper actually works in (a video loaded, so the mark bar is enabled),
 *   plus focus restoration measured the way a user meets it (open, Escape),
 *   plus focus-ring contrast read off real pixels, plus the sign-in modal with
 *   the stub refusing auth so the modal genuinely stays up. Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot, script } = require("./lib/stub.cjs");
const { setSize, inject, loadShot, tabOrder } = require("./lib/drive.cjs");
const { closeAll, URL_OK } = require("./lib/states.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB_OK = path.join(SCRATCH, "stubH-ok");
const STUB_NOAUTH = path.join(SCRATCH, "stubH-noauth");
const BASE = "/home/user/stream-trimmer/audit/run-1/area-H/out";
const DATA = path.join(BASE, "data");

const lum = (c) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
};
const hx = (h) => ({ r: parseInt(h.slice(1, 3), 16), g: parseInt(h.slice(3, 5), 16), b: parseInt(h.slice(5, 7), 16) });
const cr = (a, b) => Math.round(((Math.max(lum(hx(a)), lum(hx(b))) + 0.05) / (Math.min(lum(hx(a)), lum(hx(b))) + 0.05)) * 100) / 100;

/** Focus from the keyboard, screenshot, then read the ring off the pixels. */
async function ringContrast(a, sel) {
  const ok = await a.win.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    const p = document.createElement("button");
    p.id = "__hp"; p.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px";
    document.body.appendChild(p); p.focus();
    return true;
  }, sel);
  if (!ok) return { sel, present: false };
  await a.win.keyboard.press("Tab");
  await a.win.evaluate((s) => document.querySelector(s).focus(), sel);
  await a.win.waitForTimeout(260);
  await inject(a.win);
  await loadShot(a);
  const bands = await a.win.evaluate((s) => ({ bands: window.__H.ringBands(s), fv: document.querySelector(s).matches(":focus-visible") }), sel);
  await a.win.evaluate(() => document.getElementById("__hp")?.remove());
  if (!bands.bands) return { sel, present: false };
  const b = bands.bands;
  const ring = [1, 2, 3, 4, 5].map((n) => b["above" + n]).filter(Boolean);
  const far = b.above12 || b.above8;
  // The ring is the band nearest the control that differs most from the page.
  let best = null;
  for (const band of ring) {
    if (!far || !band) continue;
    const c = cr(band.hex, far.hex);
    if (!best || c > best.contrast) best = { hex: band.hex, contrast: c };
  }
  return {
    sel, present: true, focusVisible: bands.fv,
    pageHex: far ? far.hex : null,
    ringHex: best ? best.hex : null,
    ringContrast: best ? best.contrast : null,
    pass3to1: best ? best.contrast >= 3 : false,
    bands: Object.fromEntries(Object.entries(b).filter(([k]) => k.startsWith("above")).map(([k, v]) => [k, v && v.hex])),
  };
}

/** Open, press Escape at once, and see where focus went. */
async function openThenEscape(a, triggerSel, dialogSel) {
  await closeAll(a.win);
  await a.win.waitForTimeout(300);
  await a.win.evaluate((s) => document.querySelector(s)?.focus(), triggerSel);
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(500);
  const opened = await a.win.evaluate((s) => Boolean(document.querySelector(s)), dialogSel);
  const focusIn = await a.win.evaluate((s) => Boolean(document.activeElement?.closest(s)), dialogSel);
  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(400);
  const closed = await a.win.evaluate((s) => !document.querySelector(s), dialogSel);
  const back = await a.win.evaluate((s) => ({
    isTrigger: document.activeElement === document.querySelector(s),
    active: window.__H.describe(document.activeElement),
  }), triggerSel);
  return { triggerSel, dialogSel, opened, focusIn, closedByEscape: closed, focusRestored: back.isTrigger, focusNow: back.active };
}

(async () => {
  buildStubRoot(STUB_OK);
  buildStubRoot(STUB_NOAUTH);
  script(STUB_NOAUTH, { authFail: true });
  fs.mkdirSync(DATA, { recursive: true });
  const report = {};

  // ---- A. loaded workspace ----------------------------------------------
  {
    const a = await launch({ label: "H-kbd2", cwd: STUB_OK, outDir: path.join(BASE, "keyboard2"), signedIn: true, seed: {} });
    await a.win.waitForTimeout(6000);
    await setSize(a, 1440, 900);
    await a.win.fill('input[type="url"]', URL_OK);
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(4500);
    await inject(a.win);
    await a.shot("loaded");

    const { stops } = await tabOrder(a, { max: 90 });
    report.loadedTabOrder = stops;
    console.log("--- tab order, video loaded, 1440x900 ---");
    for (const s of stops) {
      if (s.body) { console.log(`${String(s.index).padStart(2)}  <body>`); continue; }
      console.log(
        `${String(s.index).padStart(2)}  y=${String(s.rect.y).padStart(4)} ${(s.tag + (s.id ? "#" + s.id : "")).padEnd(24)}` +
        ` "${(s.ariaLabel || s.text || "").slice(0, 30).padEnd(30)}" role=${String(s.role).padEnd(8)}` +
        ` fv=${s.focusVisible ? "Y" : "n"} outline=${s.outlineStyle}/${s.outlineWidth}/${s.outlineColor}` +
        (s.repeatOf !== undefined ? `  <= wrapped to #${s.repeatOf}` : ""),
      );
    }
    report.missingFromTabOrder = await a.win.evaluate(() => {
      const want = ["#ui-mark-in", "#ui-mark-out", "#ui-mark-whole", "#ui-add-segment", "#ui-cut",
        "#clips-tab-video", "#clips-tab-bank", "#clips-tab-all"];
      return want.map((sel) => {
        const el = document.querySelector(sel);
        if (!el) return { sel, present: false };
        return { sel, present: true, disabled: el.disabled, tabIndex: el.tabIndex, ariaSelected: el.getAttribute("aria-selected") };
      });
    });
    console.log("\nmark-bar / clips-tab reachability:", JSON.stringify(report.missingFromTabOrder));

    console.log("\n--- focus ring contrast, read off the pixels ---");
    report.rings = [];
    for (const sel of ["#ui-settings", "#ui-cut", "#ui-mark-in", "#ui-footer-format",
      'input[type="url"]', "#ui-help-button", "#clips-tab-bank"]) {
      const r = await ringContrast(a, sel);
      report.rings.push(r);
      console.log(`${sel.padEnd(22)} present=${r.present} fv=${r.focusVisible} ring=${r.ringHex} page=${r.pageHex} contrast=${r.ringContrast} pass3:1=${r.pass3to1}`);
    }

    console.log("\n--- open, then Escape ---");
    report.escape = [];
    for (const [t, d] of [
      ["#ui-settings", '[role="dialog"][aria-label="Settings"]'],
      ["#ui-footer-format", '[role="dialog"][aria-label="Format and quality"]'],
      ["#ui-campaign-chip", '[role="dialog"]'],
      ["#ui-help-button", "#ui-help-drawer"],
      ["#ui-symbols", ".surface-panel.fixed"],
      ["#ui-copy-blocks", ".surface-panel.fixed"],
    ]) {
      const r = await openThenEscape(a, t, d);
      report.escape.push(r);
      console.log(`${t.padEnd(20)} opened=${r.opened} focusIn=${r.focusIn} esc=${r.closedByEscape} restored=${r.focusRestored} focusNow=${r.focusNow ? r.focusNow.tag + "#" + r.focusNow.id : "body"}`);
    }
    await a.close();
  }

  // ---- B. sign-in modal that really stays up -----------------------------
  {
    const a = await launch({ label: "H-modal", cwd: STUB_NOAUTH, outDir: path.join(BASE, "modal"), seed: {} });
    await a.win.waitForTimeout(9000);
    await setSize(a, 1440, 900);
    await inject(a.win);
    const DLG = '[role="dialog"][aria-modal="true"]';
    const present = await a.win.evaluate((s) => Boolean(document.querySelector(s)), DLG);
    console.log("\n--- sign-in modal (auth refused) --- present:", present);
    report.modal = { present };
    if (present) {
      report.modal.shot = await a.shot("signin-modal");
      report.modal.initial = await a.win.evaluate((s) => ({
        active: window.__H.describe(document.activeElement),
        inside: Boolean(document.activeElement?.closest(s)),
      }), DLG);
      const seq = [];
      for (let i = 0; i < 40; i++) {
        await a.win.keyboard.press("Tab");
        seq.push(await a.win.evaluate((s) => {
          const el = document.activeElement;
          if (!el || el === document.body) return { body: true };
          return { inside: Boolean(el.closest(s)), tag: el.tagName.toLowerCase(), id: el.id || null, label: (el.getAttribute("aria-label") || el.innerText || "").trim().slice(0, 34) };
        }, DLG));
      }
      const outside = seq.filter((s) => s.body || !s.inside);
      report.modal.tabSequence = seq;
      report.modal.escapedCount = outside.length;
      console.log("initial focus inside modal:", report.modal.initial.inside,
        "| focus is:", report.modal.initial.active ? report.modal.initial.active.tag : "none");
      console.log(`of 40 tab stops, ${outside.length} landed OUTSIDE the modal:`);
      for (const o of outside.slice(0, 10)) console.log("   -", o.body ? "<body>" : `${o.tag}#${o.id} "${o.label}"`);
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(400);
      report.modal.closedByEscape = await a.win.evaluate((s) => !document.querySelector(s), DLG);
      console.log("closed by Escape:", report.modal.closedByEscape);
      // Is anything behind the modal clickable / readable by a screen reader?
      report.modal.backgroundInert = await a.win.evaluate(() => ({
        rootAriaHidden: document.querySelector("main")?.getAttribute("aria-hidden"),
        rootInert: document.querySelector("main")?.hasAttribute("inert"),
      }));
      console.log("background inert/aria-hidden:", JSON.stringify(report.modal.backgroundInert));
    }
    await a.close();
  }

  fs.writeFileSync(path.join(DATA, "keyboard2.json"), JSON.stringify(report, null, 2));
  console.log("\nwrote", path.join(DATA, "keyboard2.json"));
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
