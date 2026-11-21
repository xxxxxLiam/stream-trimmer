/**
 * File: v5-breakpoint.cjs
 * Path: audit/run-1/verify/slice-5/v5-breakpoint.cjs
 * Description: The decisive experiment for "are H-3, H-4 and B-10 one defect or
 *   three?". All three are reported as "something important is below the fold".
 *   If the trigger is the viewport HEIGHT they should fail at any short window;
 *   if it is the 1160px WIDTH breakpoint in ThreeColumnLayout.tsx (below which
 *   the three columns wrap into one tall stack) they should fail only below
 *   1160px wide, however short the window is.
 *
 *   So: a sweep across the breakpoint at a fixed short height, and a sweep down
 *   in height at a fixed wide width.
 *
 *   Audit-only; changes no product code.
 */
const { boot, loadVideo, log } = require("./v5-lib.cjs");

const SELS = [
  ["#ui-cut", "Cut"],
  ["#ui-col-clips", "Clips column"],
  ["#ui-mark-in", "Mark bar"],
];

async function probe(a) {
  return a.win.evaluate((sels) => {
    const vh = window.innerHeight;
    const row = document.querySelector("#ui-col-transcript")?.parentElement;
    const res = {
      vw: window.innerWidth,
      vh,
      wrapped: row ? getComputedStyle(row).flexWrap === "wrap" : null,
      items: {},
    };
    for (const [sel, name] of sels) {
      const el = document.querySelector(sel);
      if (!el) { res.items[name] = "missing"; continue; }
      const r = el.getBoundingClientRect();
      res.items[name] = r.top >= vh ? "BELOW" : r.bottom > vh + 0.5 ? "CLIPPED" : "visible";
    }
    return res;
  }, SELS);
}

(async () => {
  const run = process.argv[2] || "1";

  // Is page zoom actually something a user of THIS build can reach? Read the
  // live application menu out of the main process rather than assuming.
  {
    const a = await boot(`bp-menu-r${run}`);
    const menu = await a.app.evaluate(({ Menu, BrowserWindow }) => {
      const m = Menu.getApplicationMenu();
      const flat = [];
      const walk = (items) => {
        for (const it of items || []) {
          if (it.role) flat.push({ role: it.role, accelerator: it.accelerator || null, enabled: it.enabled });
          if (it.submenu) walk(it.submenu.items);
        }
      };
      if (m) walk(m.items);
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      return {
        hasApplicationMenu: !!m,
        zoomRoles: flat.filter((i) => /zoom/i.test(i.role)),
        minimumSize: win ? win.getMinimumSize() : null,
        currentSize: win ? win.getSize() : null,
        currentContentSize: win ? win.getContentSize() : null,
        resizable: win ? win.isResizable() : null,
      };
    });
    log("### Is this state user-reachable?");
    log("  " + JSON.stringify(menu));
    // and what the window actually refuses to go below
    const clamp = await a.app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows().find((w) => !w.isDestroyed());
      win.setSize(400, 300);
      return { askedFor: [400, 300], got: win.getSize(), content: win.getContentSize() };
    });
    log("  window clamp test: " + JSON.stringify(clamp));
    await a.close();
  }
  // A: fixed SHORT height, widths either side of the 1160px breakpoint.
  log("\n### A. height fixed at 620px (near the app's 600px minimum), width swept");
  for (const w of [1024, 1100, 1159, 1160, 1280, 1440]) {
    const a = await boot(`bp-w${w}-r${run}`, { viewport: { width: w, height: 620 } });
    await loadVideo(a);
    await a.win.waitForTimeout(1200);
    const p = await probe(a);
    log(`  ${String(w).padStart(4)}x620  wrapped=${String(p.wrapped).padEnd(5)}  ${JSON.stringify(p.items)}`);
    await a.shot(`bp-${w}x620`);
    await a.close();
  }

  // B: fixed WIDE width, heights swept down to the app minimum.
  log("\n### B. width fixed at 1280px (above the breakpoint), height swept down");
  for (const h of [900, 800, 700, 620, 600]) {
    const a = await boot(`bp-h${h}-r${run}`, { viewport: { width: 1280, height: h } });
    await loadVideo(a);
    await a.win.waitForTimeout(1200);
    const p = await probe(a);
    log(`  1280x${String(h).padStart(3)}  wrapped=${String(p.wrapped).padEnd(5)}  ${JSON.stringify(p.items)}`);
    await a.shot(`bp-1280x${h}`);
    await a.close();
  }
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
