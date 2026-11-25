/**
 * File: elements.cjs
 * Path: scripts/parity/elements.cjs
 * Description: `npm run parity:el -- <Board> --snapshot pending --window 0 --fixture <name> --panel 0`.
 *   Element-by-element check: lists every text and box inside the region on the board and in the real
 *   app (position, size, font, colours, radius, border) and prints each difference. Pixel diffs hide
 *   which element is off; this names it. Exit code 1 when anything differs.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require("playwright");
const { SHIM, snapshotDir } = require("./boardRender.cjs");

const REPO = path.resolve(__dirname, "..", "..");

/**
 * Runs in the page: every text leaf and visible box inside one side panel, positions relative to the
 * panel. The panel is the n-th 14px-radius element 250 to 340 wide inside root (left = 0, right = 1).
 */
const EXTRACT = ([panelN, rootSel]) => {
  const root = rootSel === "frame" ? window.__frame : document.documentElement;
  const panels = [...root.querySelectorAll("*")].filter((e) => {
    const b = e.getBoundingClientRect();
    return b.width >= 250 && b.width <= 340 && b.height >= 200 && getComputedStyle(e).borderTopLeftRadius === "14px";
  });
  const panel = panels[panelN];
  if (!panel) return { error: "no panel " + panelN, texts: [], boxes: [] };
  const rb = panel.getBoundingClientRect();
  const q = (v) => Math.round(v * 10) / 10;
  const out = { texts: [], boxes: [] };
  for (const el of panel.querySelectorAll("*")) {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const b = el.getBoundingClientRect();
    if (b.width === 0 || b.height === 0) continue;
    if (cs.position === "absolute" && b.width <= 1 && b.height <= 1) continue; // sr-only
    const rect = { x: q(b.x - rb.x), y: q(b.y - rb.y), w: q(b.width), h: q(b.height) };
    const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.nodeValue).join("").replace(/\s+/g, " ").trim();
    if (own) {
      out.texts.push({ text: own, rect, size: cs.fontSize, weight: cs.fontWeight, color: cs.color, lh: cs.lineHeight, num: cs.fontVariantNumeric, ls: cs.letterSpacing, display: cs.display, parent: el.parentElement ? el.parentElement.className.toString().slice(0, 80) : "" });
    } else if (el.tagName.toLowerCase() !== "svg" && !el.closest("svg")) {
      const bg = cs.backgroundColor !== "rgba(0, 0, 0, 0)" ? cs.backgroundColor : "";
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const border = bw > 0 && cs.borderTopStyle !== "none" && cs.borderTopColor !== "rgba(0, 0, 0, 0)" ? `${bw}px ${cs.borderTopColor}` : "";
      const shadow = cs.boxShadow !== "none" ? cs.boxShadow : "";
      if (bg || border || shadow) out.boxes.push({ rect, bg, border, radius: cs.borderTopLeftRadius, shadow });
    }
  }
  return out;
};

function parseArgs() {
  const a = process.argv.slice(2);
  const o = { screen: null, fixture: null, window: 0, panel: 0 };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--fixture") o.fixture = a[++i];
    else if (a[i] === "--window") o.window = /^\d+$/.test(a[i + 1] || "") ? Number(a[++i]) : 0;
    else if (a[i] === "--panel") o.panel = Number(a[++i]);
    else if (a[i] === "--snapshot") process.env.PARITY_SNAPSHOT = a[++i];
    else if (!o.screen) o.screen = a[i];
  }
  o.fixture = o.fixture || o.screen;
  return o;
}

async function boardData(o) {
  const file = `${o.screen}.dc.html`;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
    await page.route("**/support.js", (r) => r.fulfill({ contentType: "text/javascript", body: SHIM }));
    await page.goto("file://" + path.join(snapshotDir(), file));
    await page.waitForSelector("html[data-board-ready]");
    await page.evaluate(() => document.fonts && document.fonts.ready);
    await page.evaluate((n) => {
      const frames = [...document.querySelectorAll("x-dc *")].filter((e) => {
        const b = e.getBoundingClientRect();
        const st = getComputedStyle(e);
        return b.width >= 900 && b.height >= 500 && st.borderTopLeftRadius === "14px" && st.overflow === "hidden";
      });
      window.__frame = frames[n];
    }, o.window);
    // The board frame has a 1px border; the app window has none: measure from the padding box.
    return await page.evaluate(EXTRACT, [o.panel, "frame"]);
  } finally {
    await browser.close();
  }
}

async function appData(o) {
  const fx = (() => {
    const f = path.join(REPO, "audit", "harness", "fixtures", `${o.fixture}.json`);
    return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8").replace(/"\$NOW"/g, String(Date.now()))) : { seed: {}, steps: [] };
  })();
  let link = null;
  let stubRoot;
  if (fx.stub) {
    const { execFileSync } = require("node:child_process");
    stubRoot = fs.mkdtempSync(path.join(os.tmpdir(), "parity-stub-"));
    execFileSync("node", [path.join(REPO, "audit", "harness", "make-stub-root.cjs"), stubRoot]);
    fs.writeFileSync(path.join(stubRoot, "stub.json"), JSON.stringify(fx.stub));
    fs.copyFileSync(path.join(REPO, "audit", "fixtures", "fixture.mp4"), path.join(stubRoot, "fixture.mp4"));
    if (fx.stub.vttFile) fs.copyFileSync(path.join(REPO, "audit", "harness", "fixtures", fx.stub.vttFile), path.join(stubRoot, fx.stub.vttFile));
    link = path.join(REPO, "node_modules", "electron", "dist", "resources", "bin");
    fs.rmSync(link, { recursive: true, force: true });
    fs.symlinkSync(path.join(stubRoot, "resources", "bin"), link);
  }
  const { launchApp } = require("../../audit/harness/app.cjs");
  const a = await launchApp({ label: `elements-${o.screen}`, seed: fx.seed, cwd: stubRoot });
  try {
    const win = fx.window || { width: 1360, height: 760 };
    await a.app.evaluate(({ BrowserWindow }, [w, h]) => {
      for (const bw of BrowserWindow.getAllWindows()) {
        if (!bw.webContents.getURL().includes("127.0.0.1") && !bw.webContents.getURL().includes("localhost")) continue;
        bw.setMinimumSize(1, 1);
        bw.setContentSize(w, h);
      }
    }, [win.width, win.height]);
    await a.win.waitForTimeout(300);
    await a.win.waitForSelector(fx.waitFor || "#root *");
    for (const s of fx.steps || []) {
      if (s.hover) await a.win.hover(s.hover);
      else
      if (s.click) await a.win.click(s.click);
      else if (s.fill) await a.win.fill(s.fill[0], s.fill[1]);
      else if (s.press) await a.win.keyboard.press(s.press);
      else if (s.waitFor) await a.win.waitForSelector(s.waitFor);
      else if (s.wait) await a.win.waitForTimeout(s.wait);
      else if (s.eval) await a.win.evaluate(s.eval);
    }
    await a.win.waitForTimeout(400);
    return await a.win.evaluate(EXTRACT, [o.panel, "document"]);
  } finally {
    await a.close();
    if (link) fs.rmSync(link, { recursive: true, force: true });
  }
}

const near = (a, b, t = 1) => Math.abs(a - b) <= t;

function compare(board, app) {
  const diffs = [];
  const used = new Set();
  for (const bt of board.texts) {
    // match by text, nearest in y/x
    let best = -1;
    let bestD = Infinity;
    app.texts.forEach((at, i) => {
      if (used.has(i) || at.text !== bt.text) return;
      const d = Math.abs(at.rect.y - bt.rect.y) + Math.abs(at.rect.x - bt.rect.x);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0) { diffs.push(`MISSING text "${bt.text}" at ${bt.rect.x},${bt.rect.y}`); continue; }
    used.add(best);
    const at = app.texts[best];
    const f = [];
    if (!near(at.rect.x, bt.rect.x)) f.push(`x ${bt.rect.x} -> ${at.rect.x}`);
    if (!near(at.rect.y, bt.rect.y)) f.push(`y ${bt.rect.y} -> ${at.rect.y}`);
    if (!near(at.rect.w, bt.rect.w, 2)) f.push(`w ${bt.rect.w} -> ${at.rect.w}`);
    if (!near(at.rect.h, bt.rect.h, 1.5)) f.push(`h ${bt.rect.h} -> ${at.rect.h}`);
    if (at.size !== bt.size) f.push(`size ${bt.size} -> ${at.size}`);
    if (at.weight !== bt.weight) f.push(`weight ${bt.weight} -> ${at.weight}`);
    if (at.color !== bt.color) f.push(`color ${bt.color} -> ${at.color}`);
    if (at.lh !== bt.lh && !(bt.lh === "normal" && near(parseFloat(at.lh), parseFloat(at.size) * 1.21, 1.2))) f.push(`line-height ${bt.lh} -> ${at.lh}`);
    if (at.num !== bt.num) f.push(`numerals ${bt.num} -> ${at.num}`);
    if (at.ls !== bt.ls) f.push(`letter-spacing ${bt.ls} -> ${at.ls}`);
    if (f.length) diffs.push(`TEXT "${bt.text}": ${f.join(", ")}`);
  }
  app.texts.forEach((at, i) => { if (!used.has(i)) diffs.push(`EXTRA text "${at.text}" at ${at.rect.x},${at.rect.y}`); });
  // boxes: match by rect proximity
  const usedB = new Set();
  for (const bb of board.boxes) {
    let best = -1;
    let bestD = Infinity;
    app.boxes.forEach((ab, i) => {
      if (usedB.has(i)) return;
      const d = Math.abs(ab.rect.x - bb.rect.x) + Math.abs(ab.rect.y - bb.rect.y) + Math.abs(ab.rect.w - bb.rect.w) + Math.abs(ab.rect.h - bb.rect.h);
      if (d < bestD) { bestD = d; best = i; }
    });
    if (best < 0 || bestD > 40) { diffs.push(`MISSING box ${JSON.stringify(bb.rect)} bg ${bb.bg} border ${bb.border}`); continue; }
    usedB.add(best);
    const ab = app.boxes[best];
    const f = [];
    for (const k of ["x", "y", "w", "h"]) if (!near(ab.rect[k], bb.rect[k])) f.push(`${k} ${bb.rect[k]} -> ${ab.rect[k]}`);
    if (ab.bg !== bb.bg) f.push(`bg ${bb.bg || "none"} -> ${ab.bg || "none"}`);
    if (ab.border !== bb.border) f.push(`border ${bb.border || "none"} -> ${ab.border || "none"}`);
    if (ab.radius !== bb.radius) f.push(`radius ${bb.radius} -> ${ab.radius}`);
    if ((ab.shadow ? 1 : 0) !== (bb.shadow ? 1 : 0)) f.push(`glow ${bb.shadow ? "on" : "off"} -> ${ab.shadow ? "on" : "off"}`);
    if (f.length) diffs.push(`BOX @${bb.rect.x},${bb.rect.y} ${bb.rect.w}x${bb.rect.h}: ${f.join(", ")}`);
  }
  app.boxes.forEach((ab, i) => { if (!usedB.has(i)) diffs.push(`EXTRA box ${JSON.stringify(ab.rect)} bg ${ab.bg} border ${ab.border}`); });
  return diffs;
}

(async () => {
  const o = parseArgs();
  const board = await boardData(o);
  const app = await appData(o);
  if (process.env.PARITY_DUMP) fs.writeFileSync(process.env.PARITY_DUMP, JSON.stringify({ board, app }, null, 1));
  const diffs = compare(board, app);
  console.log(`board: ${board.texts.length} texts, ${board.boxes.length} boxes; app: ${app.texts.length} texts, ${app.boxes.length} boxes`);
  for (const d of diffs) console.log(d);
  console.log(diffs.length ? `${diffs.length} differences` : "no differences");
  process.exitCode = diffs.length ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(2); });
