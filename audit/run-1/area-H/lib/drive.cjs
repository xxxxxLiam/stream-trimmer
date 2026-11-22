/**
 * File: drive.cjs
 * Path: audit/run-1/area-H/lib/drive.cjs
 * Description: Area H driving helpers — inject the probe, resize the real
 *   Electron window, hand a real screenshot back into the page for pixel
 *   sampling, and walk the keyboard focus order. Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");

const PROBE_SRC = fs.readFileSync(path.join(__dirname, "probe.js"), "utf8");

async function inject(win) {
  await win.evaluate(PROBE_SRC);
}

/** Resize the real window; Playwright's setViewportSize is a no-op on Electron. */
async function setSize(a, w, h) {
  try {
    await a.app.evaluate(async ({ BrowserWindow }, size) => {
      const win = BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed()).pop();
      win.setContentSize(size.w, size.h);
    }, { w, h });
  } catch {
    try { await a.win.setViewportSize({ width: w, height: h }); } catch { /* measured as-is */ }
  }
  await a.win.waitForTimeout(400);
  return a.win.evaluate(() => ({ w: window.innerWidth, h: window.innerHeight }));
}

/** Screenshot the viewport and load it into the page's sampling canvas. */
async function loadShot(a) {
  const buf = await a.win.screenshot();
  const url = "data:image/png;base64," + buf.toString("base64");
  return a.win.evaluate((u) => window.__H.loadShot(u), url);
}

/** Everything the probe can measure for the state currently on screen. */
async function measure(a, name) {
  await inject(a.win);
  const canvas = await loadShot(a);
  const data = await a.win.evaluate(() => ({
    text: window.__H.textContrast(),
    icons: window.__H.iconContrast(),
    semantics: window.__H.semantics(),
    layout: window.__H.layout(),
    scrollers: window.__H.scrollers(),
    overlaps: window.__H.overlaps(),
    unreachable: window.__H.unreachable(),
    focusables: window.__H.focusables(),
  }));
  return { state: name, canvas, ...data };
}

/**
 * Tab from the top and record every stop: what it is, whether :focus-visible
 * matched, and what visible indicator (if any) the browser actually painted.
 */
async function tabOrder(a, { max = 80, pixel = false } = {}) {
  await inject(a.win);
  await a.win.evaluate(() => { document.activeElement?.blur?.(); document.body.focus?.(); });
  let base = null;
  if (pixel) base = await a.win.screenshot();

  const stops = [];
  const seen = new Map();
  for (let i = 0; i < max; i++) {
    await a.win.keyboard.press("Tab");
    const info = await a.win.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { body: true };
      const s = getComputedStyle(el);
      return {
        ...window.__H.describe(el),
        focusVisible: el.matches(":focus-visible"),
        outline: `${s.outlineStyle} ${s.outlineWidth} ${s.outlineColor} off:${s.outlineOffset}`,
        outlineStyle: s.outlineStyle,
        outlineWidth: s.outlineWidth,
        outlineColor: s.outlineColor,
        boxShadow: s.boxShadow === "none" ? null : s.boxShadow,
        borderColor: s.borderColor,
        inShell: Boolean(el.closest("header, footer, main, aside, [role=dialog]")),
        inDialog: Boolean(el.closest("[role=dialog]")),
        dialogLabel: el.closest("[role=dialog]")?.getAttribute("aria-label") ||
          el.closest("[role=dialog]")?.getAttribute("aria-labelledby") || null,
      };
    });
    if (info.body) { stops.push({ index: i, body: true }); continue; }
    const key = info.path + "|" + (info.text || "") + "|" + JSON.stringify(info.rect);
    if (seen.has(key)) { stops.push({ index: i, ...info, repeatOf: seen.get(key) }); break; }
    seen.set(key, i);
    stops.push({ index: i, ...info });
  }
  return { stops, base };
}

/** Pixel evidence that focusing an element actually changes what is painted. */
async function focusRingPixels(a, selector) {
  const box = await a.win.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8), width: r.width + 16, height: r.height + 16 };
  }, selector);
  if (!box) return null;
  await a.win.evaluate(() => document.activeElement?.blur?.());
  await a.win.waitForTimeout(250);
  const before = await a.win.screenshot({ clip: box });
  await a.win.evaluate((sel) => {
    const el = document.querySelector(sel);
    el.focus();
    // Mark it keyboard-focused so :focus-visible applies the real ring.
  }, selector);
  await a.win.keyboard.press("Shift+Tab");
  await a.win.keyboard.press("Tab");
  await a.win.waitForTimeout(250);
  const after = await a.win.screenshot({ clip: box });
  return { before, after, box };
}

module.exports = { inject, setSize, loadShot, measure, tabOrder, focusRingPixels, PROBE_SRC };
