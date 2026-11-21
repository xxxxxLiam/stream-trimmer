/**
 * File: run-focus-portal.cjs
 * Path: audit/run-2/area-H/run-focus-portal.cjs
 * Description: Three fixes in one pass.
 *
 *   H-5 — the tab close button. Tab to it, confirm it takes focus, read its
 *   effective opacity and computed outline, then diff its own box byte for byte
 *   before and after focus. A ring that computes but paints nothing is the
 *   defect; the control #ui-settings is the positive control that must change.
 *
 *   T8's portalled help button. Where it lands on every screen and at every
 *   size, whether the invisible placeholder leaves a gap or a second control,
 *   whether the two boxes agree, and where it sits in the Tab order.
 *
 *   Tab order and focus-visible paint for every stop, from a cold start and
 *   with a video loaded.
 *
 *   Audit-only; no product code is touched.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { buildStubRoot } = require("./lib/stub.cjs");
const H = require("./lib/h2.cjs");
const { tabOrder, inject } = require("./lib/drive.cjs");

const OUT = path.join(__dirname, "out");
const DATA = path.join(OUT, "data");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

const sha = (b) => crypto.createHash("sha1").update(b).digest("hex").slice(0, 16);

/** Does focusing this selector change one pixel of its own box? */
async function focusPaintDiff(a, sel, pad = 10) {
  const box = await a.win.evaluate(({ s, p }) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return { x: Math.max(0, Math.round(r.x - p)), y: Math.max(0, Math.round(r.y - p)),
      width: Math.round(r.width + p * 2), height: Math.round(r.height + p * 2) };
  }, { s: sel, p: pad });
  if (!box) return { sel, missing: true };
  await a.win.evaluate(() => document.activeElement?.blur?.());
  await a.win.waitForTimeout(300);
  const before = await a.win.screenshot({ clip: box });
  // Focus it the way a keyboard does, so :focus-visible really applies.
  await a.win.evaluate((s) => document.querySelector(s).focus(), sel);
  await a.win.keyboard.press("Shift+Tab");
  await a.win.keyboard.press("Tab");
  await a.win.waitForTimeout(350);
  const state = await a.win.evaluate((s) => {
    const el = document.querySelector(s);
    const cs = getComputedStyle(el);
    let o = 1, n = el;
    while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity || "1"); n = n.parentElement; }
    return {
      isActive: document.activeElement === el,
      matchesFocusVisible: el.matches(":focus-visible"),
      ownOpacity: cs.opacity, effectiveOpacity: Math.round(o * 1000) / 1000,
      outline: `${cs.outlineColor} ${cs.outlineStyle} ${cs.outlineWidth} offset ${cs.outlineOffset}`,
      boxShadow: cs.boxShadow,
      className: String(el.className || "").slice(0, 160),
      tabIndex: el.tabIndex,
    };
  }, sel);
  const after = await a.win.screenshot({ clip: box });
  return { sel, box, ...state, beforeSha: sha(before), afterSha: sha(after),
    paintChanged: Buffer.compare(before, after) !== 0 };
}

/** Where the portalled help button is, and what its placeholder is doing. */
const HELP_GEOM = () => {
  const btn = document.getElementById("ui-help-button");
  const ph = document.querySelector('span.icon-btn[aria-hidden="true"]');
  const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect();
    return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height),
      right: Math.round(r.right), bottom: Math.round(r.bottom) }; };
  const headerBtns = [...document.querySelectorAll("header button, header a[href]")].map((b) => {
    const r = b.getBoundingClientRect();
    return { what: b.id || b.getAttribute("aria-label") || (b.innerText || "").trim().slice(0, 18),
      x: Math.round(r.x), right: Math.round(r.right), y: Math.round(r.y) };
  });
  const bRect = rect(btn), pRect = rect(ph);
  // Is anything else drawn at the help button's own pixels (a double control)?
  let onTop = null;
  if (bRect) {
    const el = document.elementFromPoint(bRect.x + bRect.w / 2, bRect.y + bRect.h / 2);
    onTop = el ? (el.id ? "#" + el.id : el.tagName.toLowerCase() + "." +
      String(el.className || "").split(/\s+/).filter(Boolean).slice(0, 2).join(".")) : null;
  }
  return {
    buttonPresent: Boolean(btn),
    buttonParent: btn ? btn.parentElement?.tagName?.toLowerCase() : null,
    buttonStyle: btn ? { position: getComputedStyle(btn).position, zIndex: getComputedStyle(btn).zIndex } : null,
    buttonRect: bRect,
    placeholderPresent: Boolean(ph),
    placeholderParent: ph ? ph.parentElement?.tagName?.toLowerCase() : null,
    placeholderRect: pRect,
    placeholderVisibility: ph ? getComputedStyle(ph).visibility : null,
    placeholderPointerEvents: ph ? getComputedStyle(ph).pointerEvents : null,
    placeholderAriaHidden: ph ? ph.getAttribute("aria-hidden") : null,
    slotMatchesButton: bRect && pRect
      ? (bRect.x === pRect.x && bRect.y === pRect.y && bRect.w === pRect.w && bRect.h === pRect.h)
      : null,
    slotDelta: bRect && pRect ? { dx: bRect.x - pRect.x, dy: bRect.y - pRect.y } : null,
    elementOnTopOfButton: onTop,
    headerControls: headerBtns,
    // A second "Help" control anywhere would be the double-control failure.
    helpLabelled: [...document.querySelectorAll('[aria-label="Help"], [title^="Help"]')].length,
    helpIds: [...document.querySelectorAll("#ui-help-button")].length,
  };
};

const SCREENS = [
  { name: "workspace-empty", open: async () => {} },
  { name: "video-loaded", video: true, open: async () => {} },
  { name: "help-drawer-open", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-help-button")?.click()); } },
  { name: "copy-blocks-open", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-copy-blocks")?.click()); } },
  { name: "symbols-open", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-symbols")?.click()); } },
  { name: "settings-open", video: true, open: async (a) => { await a.win.evaluate(() => document.getElementById("ui-settings")?.click()); } },
  { name: "sign-in-modal", keepGate: true, open: async (a) => { await a.win.waitForTimeout(4500); } },
];

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const log = [];
  const say = (s) => { console.log(s); log.push(s); };
  const out = { h5: {}, portal: [], tabOrders: [] };

  // ---- H-5: the tab close button ------------------------------------------
  {
    const a = await H.open({ label: "h2-h5", cwd: STUB, outDir: path.join(OUT, "h5"), skipSeeded: true });
    await H.setSize(a, 1280, 800);
    await inject(a.win);
    say("\n===== H-5: the tab close button =====");
    const stops = await tabOrder(a, { max: 6 });
    say("first Tab stops: " + stops.stops.map((s, i) =>
      `${i + 1}:${s.body ? "<body>" : (s.ariaLabel || s.text || s.tag)}`).join(" | "));
    const sel = 'button[aria-label^="Close"]';
    const closeBtn = await focusPaintDiff(a, sel, 12);
    say("close button: " + JSON.stringify(closeBtn, null, 2));
    const control = await focusPaintDiff(a, "#ui-settings", 12);
    say(`positive control #ui-settings: paintChanged=${control.paintChanged} ` +
      `effectiveOpacity=${control.effectiveOpacity} outline=${control.outline}`);
    // Hovering the tab is the mouse route — does the button appear then?
    const hovered = await a.win.evaluate(() => {
      const tab = document.querySelector('[role="tab"]');
      const btn = tab?.querySelector('button[aria-label^="Close"]');
      return { tabPresent: Boolean(tab), btnClass: String(btn?.className || "") };
    });
    say("markup: " + JSON.stringify(hovered));
    out.h5 = { stops: stops.stops, closeBtn, control, hovered };
    await a.shot("h5-tab-close");
    await a.close();
  }

  // ---- the portalled help button on every screen and at every size --------
  for (const sc of SCREENS) {
    let a;
    try {
      a = await H.open({ label: `h2-portal-${sc.name}`, cwd: STUB, outDir: path.join(OUT, `portal-${sc.name}`),
        skipSeeded: !sc.keepGate, keepGate: sc.keepGate });
      say(`\n===== portalled Help on "${sc.name}" =====`);
      for (const [w, h] of [[900, 600], [1100, 760], [1280, 800], [1440, 900]]) {
        await H.setSize(a, w, h);
        if (sc.video && w === 900) { /* load once, at a workable size */ }
        if (sc.video && w === 1100) { try { await H.loadVideo(a); } catch { say("  (video did not load)"); } }
        await sc.open(a);
        await a.win.waitForTimeout(600);
        const g = await a.win.evaluate(HELP_GEOM);
        out.portal.push({ screen: sc.name, w, h, ...g });
        const lastHeader = g.headerControls.length
          ? g.headerControls.reduce((m, c) => (c.right > m.right ? c : m), g.headerControls[0]) : null;
        say(`  ${w}x${h}  btn=${JSON.stringify(g.buttonRect)} parent=${g.buttonParent} ` +
          `z=${g.buttonStyle?.zIndex} pos=${g.buttonStyle?.position}`);
        say(`          placeholder=${JSON.stringify(g.placeholderRect)} vis=${g.placeholderVisibility} ` +
          `pe=${g.placeholderPointerEvents} aria-hidden=${g.placeholderAriaHidden} matches=${g.slotMatchesButton} delta=${JSON.stringify(g.slotDelta)}`);
        say(`          onTopOfButton=${g.elementOnTopOfButton}  #ui-help-button count=${g.helpIds}  Help-labelled nodes=${g.helpLabelled}`);
        say(`          rightmost header control: ${lastHeader ? JSON.stringify(lastHeader) : "none"}`);
        await a.shot(`${sc.name}-${w}x${h}`);
      }
      // Tab order: where does Help land?
      await inject(a.win);
      const to = await tabOrder(a, { max: 70 });
      const idx = to.stops.findIndex((s) => s.id === "ui-help-button");
      const total = to.stops.length;
      say(`  Tab order: Help is stop ${idx + 1} of ${total} recorded stops` +
        `${idx === total - 1 ? " (LAST)" : ""}`);
      say(`  full order: ${to.stops.map((s, i) => `${i + 1}:${s.body ? "<body>" : (s.id || s.ariaLabel || s.text || s.tag)}`).join(" > ")}`);
      out.tabOrders.push({ screen: sc.name, helpIndex: idx, total, stops: to.stops });
    } catch (e) {
      say(`  ${sc.name}: FAILED — ${String(e).slice(0, 200)}`);
    } finally { if (a) await a.close(); }
  }

  fs.writeFileSync(path.join(DATA, "focus-portal.json"), JSON.stringify(out, null, 2));
  fs.writeFileSync(path.join(DATA, "focus-portal.txt"), log.join("\n"));
  console.log("\nwrote", path.join(DATA, "focus-portal.json"));
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
