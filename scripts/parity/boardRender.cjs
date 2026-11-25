/**
 * File: boardRender.cjs
 * Path: scripts/parity/boardRender.cjs
 * Description: Renders a Claude Design canvas board (`.dc.html`) to a PNG without the canvas's own
 *   `support.js` runtime, which the snapshot does not include. A small stand-in expands the two
 *   directives the boards use (`<sc-for list as>` and `<sc-if value>`) and `{{path}}` bindings from
 *   the board's own `renderVals()`, then Playwright screenshots it at the frame size in canvas.json.
 *   Boards that call `setState` render their initial state only.
 */
const path = require("node:path");
const fs = require("node:fs");
const { chromium } = require("playwright");

const SNAPSHOTS = {
  snapshot: "/mnt/project-files/design/canvas-snapshot-2026-11-24/project",
  // One board per workspace state (03.2.x), published after the snapshot.
  pending: "/mnt/project-files/design/canvas-pending/project",
};
/** Read at call time so the CLI flag can set it after load. */
const snapshotDir = () => SNAPSHOTS[process.env.PARITY_SNAPSHOT] || process.env.PARITY_SNAPSHOT || SNAPSHOTS.snapshot;

/** The folder that holds a board: the chosen snapshot, else the frozen one (a board published once and not redrawn, such as Start, stays there). */
function boardDir(file) {
  const dir = snapshotDir();
  return fs.existsSync(path.join(dir, file)) ? dir : SNAPSHOTS.snapshot;
}

/** Runs in the page. Replaces the missing support.js. */
const SHIM = `
(() => {
  class DCLogic {
    constructor() { this.props = {}; this.state = {}; }
    setState(p) { this.state = Object.assign({}, this.state, typeof p === 'function' ? p(this.state) : p); }
    rgba(hex, a) { const n = parseInt(hex.replace('#',''),16); return 'rgba('+(n>>16&255)+','+(n>>8&255)+','+(n&255)+','+a+')'; }
    parse(v) { return v; }
  }
  window.DCLogic = DCLogic;
  const get = (expr, scope) => {
    const keys = Object.keys(scope);
    return new Function(...keys, 'return (' + expr + ')')(...keys.map((k) => scope[k]));
  };
  const interp = (str, scope) => str.replace(/\\{\\{([\\s\\S]*?)\\}\\}/g, (_, e) => {
    const v = get(e.trim(), scope); return v == null ? '' : String(v);
  });
  const walk = (node, scope) => {
    if (node.nodeType === 3) { if (node.nodeValue.includes('{{')) node.nodeValue = interp(node.nodeValue, scope); return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'sc-for') {
      const list = get(node.getAttribute('list').replace(/^\\{\\{|\\}\\}$/g, ''), scope) || [];
      const as = node.getAttribute('as') || 'item';
      const frag = document.createDocumentFragment();
      list.forEach((item, i) => {
        const s = Object.assign({}, scope, { [as]: item, [as + 'Index']: i, index: i });
        for (const c of node.childNodes) { const k = c.cloneNode(true); walk(k, s); frag.appendChild(k); }
      });
      node.replaceWith(frag); return;
    }
    if (tag === 'sc-if') {
      const ok = get(node.getAttribute('value').replace(/^\\{\\{|\\}\\}$/g, ''), scope);
      const frag = document.createDocumentFragment();
      if (ok) for (const c of [...node.childNodes]) { walk(c, scope); frag.appendChild(c); }
      node.replaceWith(frag); return;
    }
    for (const a of [...node.attributes]) {
      if (a.name.startsWith('hint-')) { node.removeAttribute(a.name); continue; }
      if (a.value.includes('{{')) node.setAttribute(a.name, interp(a.value, scope));
    }
    for (const c of [...node.childNodes]) walk(c, scope);
  };
  window.addEventListener('DOMContentLoaded', () => {
    const root = document.querySelector('x-dc');
    const sc = document.querySelector('script[data-dc-script]');
    let vals = {};
    if (sc) {
      const props = JSON.parse(sc.getAttribute('data-props') || '{}');
      const Component = new Function('DCLogic', sc.textContent + '\\n;return Component;')(DCLogic);
      const inst = new Component();
      inst.props = props;
      vals = inst.renderVals ? inst.renderVals() : {};
    }
    const helmet = root.querySelector('helmet');
    if (helmet) { for (const c of [...helmet.childNodes]) document.head.appendChild(c); helmet.remove(); }
    walk(root, vals);
    document.documentElement.setAttribute('data-board-ready', '1');
  });
})();
`;

/** Frame size of a board, from canvas.json. */
function boardFrame(file) {
  const meta = JSON.parse(fs.readFileSync(path.join(boardDir(file), "canvas.json"), "utf8"));
  const b = meta.boards[file];
  if (!b) throw new Error(`${file} is not in canvas.json`);
  return { width: b.w, height: b.h, title: b.title };
}

/**
 * Screenshot a board at its frame size, or (opts.window = n) just the n-th app-window drawing on
 * it: the 14px-radius, overflow-hidden frame at least 900 by 500, in document order. Boards draw
 * the window inside a heading and a margin, so this is the part the real app can be compared to.
 * Returns { png, frame } with frame = the size that was captured.
 */
async function renderBoard(screen, opts = {}) {
  const file = screen.endsWith(".dc.html") ? screen : `${screen}.dc.html`;
  const frame = boardFrame(file);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: frame.width, height: frame.height },
      deviceScaleFactor: 1,
    });
    await page.route("**/support.js", (r) => r.fulfill({ contentType: "text/javascript", body: SHIM }));
    await page.goto("file://" + path.join(boardDir(file), file));
    await page.waitForSelector("html[data-board-ready]");
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const pick = opts.window !== undefined ? { n: opts.window, w: 900, h: 500 } : opts.el !== undefined ? { n: opts.el, w: 300, h: Number(process.env.PARITY_EL_MIN_H) || 400 } : null;
    if (pick) {
      const handles = await page.evaluateHandle(([minW, minH]) =>
        [...document.querySelectorAll("x-dc *")].filter((e) => {
          const b = e.getBoundingClientRect();
          const st = getComputedStyle(e);
          return b.width >= minW && b.height >= minH && st.borderTopLeftRadius === "14px" && (st.overflow === "hidden" || minW < 900);
        }),
        [pick.w, pick.h],
      );
      const els = await handles.getProperties();
      const el = els.get(String(pick.n))?.asElement();
      if (!el) throw new Error(`${file} has no frame #${pick.n} (rounded 14px, at least ${pick.w} by ${pick.h})`);
      // Page coordinates. A board can draw a frame partly outside itself (a crop of the right panel,
      // a window cut off at the bottom): capture only what is visible, and report where in the frame
      // that part starts, so the app can be cropped to the same region.
      const box = await el.evaluate((n) => {
        const r = n.getBoundingClientRect();
        return { x: r.x + scrollX, y: r.y + scrollY, width: r.width, height: r.height, pw: document.documentElement.scrollWidth, ph: document.documentElement.scrollHeight };
      });
      const x0 = Math.max(0, Math.round(box.x));
      const y0 = Math.max(0, Math.round(box.y));
      const x1 = Math.min(box.pw, Math.round(box.x + box.width));
      const y1 = Math.min(box.ph, Math.round(box.y + box.height));
      const width = Math.round(box.width);
      const height = Math.round(box.height);
      const png = await page.screenshot({ fullPage: true, clip: { x: x0, y: y0, width: x1 - x0, height: y1 - y0 } });
      const dump = opts.dump ? await el.evaluate(new Function("el", "const f = " + require("./dumpLayout.cjs").DUMP_SRC + "; const r = el.getBoundingClientRect(); return f(r.x, r.y, el);")) : undefined;
      return {
        png,
        dump,
        frame: { width, height, clip: { x: x0 - Math.round(box.x), y: y0 - Math.round(box.y), width: x1 - x0, height: y1 - y0 }, title: frame.title },
      };
    }
    return { png: await page.screenshot({ clip: { x: 0, y: 0, width: frame.width, height: frame.height } }), frame };
  } finally {
    await browser.close();
  }
}

/** Rects (relative to the panel, whole px) of the panel's rows: the tab strip, then each row of the body. */
const MEASURE = (panel) => {
  const base = panel.getBoundingClientRect();
  const rows = [];
  const add = (e, depth) => {
    const r = e.getBoundingClientRect();
    rows.push({ d: depth, x: Math.round(r.x - base.x), y: Math.round(r.y - base.y), w: Math.round(r.width), h: Math.round(r.height), t: (e.textContent || "").trim().replace(/\s+/g, " ").slice(0, 28) });
  };
  const walk = (e, depth) => {
    for (const c of e.children) {
      // A wrapper with one child (the tab panel, a panel body) adds nothing: look inside it.
      if (c.children.length === 1 && c.getAttribute("role") !== "tablist" && depth < 3) {
        walk(c, depth);
        continue;
      }
      add(c, depth);
      if (depth < 2 && c.children.length > 1 && !(c.getAttribute("role") === "tablist")) walk(c, depth + 1);
    }
  };
  walk(panel, 0);
  return rows;
};

/**
 * Screenshot one panel of a board: the 14px-radius, overflow-hidden frame that is the smallest one
 * containing `text` (e.g. "Waiting in this video"). Boards that crop a panel inside a bigger frame
 * (the 356px right-panel crops) are compared panel to panel this way.
 */
async function renderBoardPanel(screen, text) {
  const file = screen.endsWith(".dc.html") ? screen : `${screen}.dc.html`;
  const frame = boardFrame(file);
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: frame.width, height: frame.height }, deviceScaleFactor: 1 });
    await page.route("**/support.js", (r) => r.fulfill({ contentType: "text/javascript", body: SHIM }));
    await page.goto("file://" + path.join(boardDir(file), file));
    await page.waitForSelector("html[data-board-ready]");
    await page.evaluate(() => document.fonts && document.fonts.ready);
    const handle = await page.evaluateHandle((t) => {
      const frames = [...document.querySelectorAll("x-dc *")].filter((e) => {
        const st = getComputedStyle(e);
        return st.borderTopLeftRadius === "14px" && st.overflow === "hidden" && e.textContent.includes(t);
      });
      return frames.sort((a, b) => a.textContent.length - b.textContent.length)[0] || null;
    }, text);
    const el = handle.asElement();
    if (!el) throw new Error(`${file} has no panel containing "${text}"`);
    const boxes = await el.evaluate(MEASURE);
    return { png: await el.screenshot(), frame: { title: frame.title }, boxes };
  } finally {
    await browser.close();
  }
}

module.exports = { boardDir, MEASURE, renderBoardPanel, renderBoard, boardFrame, SHIM, snapshotDir, get SNAPSHOT() { return snapshotDir(); } };
