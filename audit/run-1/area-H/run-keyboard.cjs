/**
 * File: run-keyboard.cjs
 * Path: audit/run-1/area-H/run-keyboard.cjs
 * Description: Area H pass 3 — focus order, focus visibility (measured as a
 *   real pixel difference, not inferred from CSS), focus trapping, Escape,
 *   and focus restoration, for every overlay and both modals. Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot } = require("./lib/stub.cjs");
const { setSize, inject, tabOrder } = require("./lib/drive.cjs");
const { closeAll, jsClick } = require("./lib/states.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB = path.join(SCRATCH, "stubH2");
const BASE = "/home/user/stream-trimmer/audit/run-1/area-H/out";
const DATA = path.join(BASE, "data");

/** Max per-pixel difference between two PNG buffers of the same clip. */
function pngDiffers(a, b) {
  if (!a || !b) return null;
  if (a.length !== b.length) return true;
  return !a.equals(b);
}

/** Focus the Nth tab stop and prove the paint changed inside its own box. */
async function focusPaintCheck(a, selector) {
  const box = await a.win.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0) return null;
    return { x: Math.max(0, Math.floor(r.x - 6)), y: Math.max(0, Math.floor(r.y - 6)), width: Math.ceil(r.width + 12), height: Math.ceil(r.height + 12) };
  }, selector);
  if (!box) return { selector, present: false };
  await a.win.evaluate(() => document.activeElement?.blur?.());
  await a.win.waitForTimeout(220);
  const before = await a.win.screenshot({ clip: box });
  // Focus by keyboard so :focus-visible is satisfied the way a real user does it.
  await a.win.evaluate((sel) => {
    const el = document.querySelector(sel);
    const probe = document.createElement("button");
    probe.id = "__h_probe";
    probe.style.cssText = "position:fixed;left:-9999px;top:0;width:1px;height:1px";
    document.body.appendChild(probe);
    probe.focus();
    el.setAttribute("data-h-target", "1");
  }, selector);
  await a.win.keyboard.press("Tab"); // keyboard-initiated move sets :focus-visible
  await a.win.evaluate((sel) => document.querySelector(sel).focus(), selector);
  await a.win.waitForTimeout(220);
  const state = await a.win.evaluate((sel) => {
    const el = document.querySelector(sel);
    const s = getComputedStyle(el);
    return {
      focused: document.activeElement === el,
      focusVisible: el.matches(":focus-visible"),
      outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor}`,
      boxShadow: s.boxShadow === "none" ? null : s.boxShadow,
      opacity: s.opacity,
      effOpacity: (() => { let o = 1, n = el; while (n && n.nodeType === 1) { o *= parseFloat(getComputedStyle(n).opacity || "1"); n = n.parentElement; } return o; })(),
    };
  }, selector);
  const after = await a.win.screenshot({ clip: box });
  await a.win.evaluate(() => document.getElementById("__h_probe")?.remove());
  return { selector, present: true, paintChanged: pngDiffers(before, after), ...state, box };
}

/** Open an overlay, then test trapping, Escape and focus restoration. */
async function overlayBehaviour(a, { name, triggerSel, dialogSel }) {
  await closeAll(a.win);
  await a.win.waitForTimeout(300);
  // Focus the trigger from the keyboard, then activate it from the keyboard.
  await a.win.evaluate((sel) => document.querySelector(sel)?.focus(), triggerSel);
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(600);

  const opened = await a.win.evaluate((sel) => Boolean(document.querySelector(sel)), dialogSel);
  const afterOpen = await a.win.evaluate((sel) => {
    const el = document.activeElement;
    return {
      active: window.__H.describe(el),
      insideOverlay: Boolean(el && el.closest(sel)),
    };
  }, dialogSel);

  // Tab 40 times; does focus ever leave the overlay?
  const escaped = [];
  for (let i = 0; i < 40; i++) {
    await a.win.keyboard.press("Tab");
    const out = await a.win.evaluate((sel) => {
      const el = document.activeElement;
      if (!el || el === document.body) return { body: true };
      return { inside: Boolean(el.closest(sel)), d: window.__H.describe(el) };
    }, dialogSel);
    if (out.body || !out.inside) escaped.push({ i, ...out });
  }

  await a.win.keyboard.press("Escape");
  await a.win.waitForTimeout(500);
  const closedByEsc = await a.win.evaluate((sel) => !document.querySelector(sel), dialogSel);
  const focusAfterClose = await a.win.evaluate((sel) => {
    const el = document.activeElement;
    return { active: window.__H.describe(el), isTrigger: el === document.querySelector(sel) };
  }, triggerSel);

  return {
    name, triggerSel, dialogSel, opened,
    focusMovedIntoOverlay: afterOpen.insideOverlay,
    focusAfterOpen: afterOpen.active,
    tabsLeftOverlay: escaped.length,
    firstEscape: escaped[0] || null,
    closedByEscape: closedByEsc,
    focusRestoredToTrigger: focusAfterClose.isTrigger,
    focusAfterClose: focusAfterClose.active,
  };
}

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const report = {};

  // ---- A. signed-in workspace -------------------------------------------
  {
    const a = await launch({ label: "H-kbd", cwd: STUB, outDir: path.join(BASE, "keyboard"), signedIn: true, seed: {} });
    await a.win.waitForTimeout(6000);
    await setSize(a, 1440, 900);
    await inject(a.win);

    const { stops } = await tabOrder(a, { max: 70 });
    report.workspaceTabOrder = stops;
    console.log("--- workspace tab order ---");
    for (const s of stops) {
      if (s.body) { console.log(`${String(s.index).padStart(2)}  <body>`); continue; }
      console.log(
        `${String(s.index).padStart(2)}  ${(s.tag + (s.id ? "#" + s.id : "")).padEnd(26)}` +
        ` "${(s.ariaLabel || s.text || "").slice(0, 26).padEnd(26)}"` +
        ` role=${String(s.role).padEnd(8)} fv=${s.focusVisible ? "Y" : "n"}` +
        ` outline=${s.outlineStyle}/${s.outlineWidth}` + (s.repeatOf !== undefined ? `  <= wrapped to #${s.repeatOf}` : ""),
      );
    }

    // Non-interactive tab stops and missing-indicator candidates.
    report.oddStops = stops.filter((s) => !s.body && (s.tag === "div" || s.tag === "span" || s.tag === "section"));
    report.unreachable = await a.win.evaluate(() => window.__H.unreachable());

    // ---- focus paint evidence -------------------------------------------
    console.log("\n--- focus indicator, measured as a paint change ---");
    const targets = [
      "#ui-settings", "#ui-help-button", "#ui-copy-blocks", "#ui-symbols",
      "#ui-footer-format", "#ui-footer-clips", "#ui-mark-in", "#ui-cut",
      'input[type="url"]', '#ui-col-transcript input[type="search"], #ui-col-transcript input',
      '[role="tab"][aria-selected="true"]',
      'div[role="tab"] button[aria-label^="Close"]',
    ];
    report.focusPaint = [];
    for (const t of targets) {
      const r = await focusPaintCheck(a, t);
      report.focusPaint.push(r);
      console.log(
        `${t.slice(0, 48).padEnd(50)} present=${r.present} painted=${r.paintChanged}` +
        ` fv=${r.focusVisible} opacity=${r.effOpacity} outline=${r.outline}`,
      );
    }

    // ---- overlays --------------------------------------------------------
    console.log("\n--- overlay keyboard behaviour ---");
    report.overlays = [];
    const overlays = [
      { name: "settings popover", triggerSel: "#ui-settings", dialogSel: '[role="dialog"][aria-label="Settings"]' },
      { name: "format popover", triggerSel: "#ui-footer-format", dialogSel: '[role="dialog"][aria-label="Format and quality"]' },
      { name: "campaign popover", triggerSel: "#ui-campaign-chip", dialogSel: '[role="dialog"]' },
      { name: "help drawer", triggerSel: "#ui-help-button", dialogSel: "#ui-help-drawer" },
      { name: "symbol palette", triggerSel: "#ui-symbols", dialogSel: '[aria-label="Symbols"], #ui-symbols-panel, .surface-panel.fixed' },
      { name: "copy blocks", triggerSel: "#ui-copy-blocks", dialogSel: '[aria-label="Copy blocks"], .surface-panel.fixed' },
    ];
    for (const o of overlays) {
      try {
        const r = await overlayBehaviour(a, o);
        report.overlays.push(r);
        console.log(
          `${o.name.padEnd(18)} opened=${r.opened} focusIn=${r.focusMovedIntoOverlay}` +
          ` tabsOut=${r.tabsLeftOverlay} esc=${r.closedByEscape} restored=${r.focusRestoredToTrigger}` +
          `  (focus after open: ${r.focusAfterOpen ? r.focusAfterOpen.tag + "#" + r.focusAfterOpen.id : "none"})`,
        );
      } catch (e) {
        console.log(`${o.name}: ${e.message}`);
        report.overlays.push({ name: o.name, error: e.message });
      }
    }
    await a.close();
  }

  // ---- B. the sign-in modal (not signed in) ------------------------------
  {
    const a = await launch({ label: "H-kbd-modal", cwd: STUB, outDir: path.join(BASE, "keyboard-modal"), seed: {} });
    await a.win.waitForTimeout(6000);
    await setSize(a, 1440, 900);
    await inject(a.win);
    const DLG = '[role="dialog"][aria-modal="true"]';

    const start = await a.win.evaluate((sel) => ({
      present: Boolean(document.querySelector(sel)),
      active: window.__H.describe(document.activeElement),
      activeInside: Boolean(document.activeElement?.closest(sel)),
    }), DLG);
    console.log("\n--- sign-in modal ---");
    console.log("present:", start.present, "initial focus inside modal:", start.activeInside,
      "focus is:", start.active ? start.active.tag + "." + (start.active.cls || "") : "none");

    const out = [];
    for (let i = 0; i < 45; i++) {
      await a.win.keyboard.press("Tab");
      const s = await a.win.evaluate((sel) => {
        const el = document.activeElement;
        if (!el || el === document.body) return { body: true };
        return { inside: Boolean(el.closest(sel)), d: window.__H.describe(el) };
      }, DLG);
      out.push({ i, ...s });
    }
    const leaked = out.filter((s) => s.body || !s.inside);
    console.log(`tab stops that left the modal: ${leaked.length} / 45`);
    for (const l of leaked.slice(0, 8)) {
      console.log(`   #${l.i} -> ${l.body ? "<body>" : l.d.tag + (l.d.id ? "#" + l.d.id : "") + ' "' + (l.d.ariaLabel || l.d.text || "").slice(0, 30) + '"'}`);
    }
    await a.win.keyboard.press("Escape");
    await a.win.waitForTimeout(500);
    const afterEsc = await a.win.evaluate((sel) => Boolean(document.querySelector(sel)), DLG);
    console.log("still open after Escape:", afterEsc);
    report.signinModal = { start, leaked: leaked.length, sample: leaked.slice(0, 10), stillOpenAfterEscape: afterEsc, totalTabs: 45 };
    report.signinModalShot = await a.shot("signin-modal");
    await a.close();
  }

  fs.writeFileSync(path.join(DATA, "keyboard.json"), JSON.stringify(report, null, 2));
  console.log("\nwrote", path.join(DATA, "keyboard.json"));
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
