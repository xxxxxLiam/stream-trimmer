/**
 * File: parity.cjs
 * Path: scripts/parity/parity.cjs
 * Description: `npm run parity -- <screen> [--fixture name] [--threshold 0.1]`. Renders the board,
 *   launches the real app from audit/harness with audit/harness/fixtures/<fixture>.json, screenshots
 *   both at the board's frame size and writes board | app | diff PNGs (pixelmatch, anti-aliasing
 *   tolerated) to audit/out/parity/<screen>/. `--board-only` skips the app (board render check).
 *   Needs a built app (`npm run build:electron`) and a display (`xvfb-run -a`).
 */
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch");
const { renderBoard } = require("./boardRender.cjs");

const REPO = path.resolve(__dirname, "..", "..");

function args() {
  const a = process.argv.slice(2);
  const out = { screen: null, fixture: null, threshold: 0.1, boardOnly: false, window: undefined, el: undefined };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--fixture") out.fixture = a[++i];
    else if (a[i] === "--threshold") out.threshold = Number(a[++i]);
    else if (a[i] === "--board-only") out.boardOnly = true;
    else if (a[i] === "--window") out.window = /^\d+$/.test(a[i + 1] || "") ? Number(a[++i]) : 0;
    else if (a[i] === "--el") out.el = Number(a[++i]);
    else if (a[i] === "--dump") out.dump = true;
    else if (a[i] === "--snapshot") process.env.PARITY_SNAPSHOT = a[++i];
    else if (!out.screen) out.screen = a[i];
  }
  if (!out.screen) {
    console.error("usage: npm run parity -- <Screen> [--window [n] | --el n] [--snapshot pending|snapshot|<dir>] [--fixture name] [--threshold 0.1] [--board-only]");
    process.exit(2);
  }
  out.fixture = out.fixture || out.screen;
  return out;
}

/** Fixture: { seed, steps, waitFor }. seed is settings.json; steps are playwright page calls. */
function loadFixture(name) {
  const f = path.join(REPO, "audit", "harness", "fixtures", `${name}.json`);
  if (!fs.existsSync(f)) return { seed: {}, steps: [] };
  // "$NOW" in a fixture becomes the current time in ms, so "made today" counts stay today.
  const fx = JSON.parse(fs.readFileSync(f, "utf8").replace(/"\$NOW"/g, String(Date.now())));
  // "extends": another fixture's name. Its keys apply first; seed and stub merge one level down, and
  // every other key here replaces the base's.
  if (!fx.extends) return fx;
  const base = loadFixture(fx.extends);
  return { ...base, ...fx, seed: { ...base.seed, ...fx.seed }, stub: base.stub ? { ...base.stub, ...fx.stub } : fx.stub };
}

async function runSteps(win, steps) {
  for (const s of steps || []) {
    if (s.click) await win.click(s.click);
    else if (s.fill) await win.fill(s.fill[0], s.fill[1]);
    else if (s.hover) await win.hover(s.hover);
    else if (s.press) await win.keyboard.press(s.press);
    else if (s.waitFor) await win.waitForSelector(s.waitFor);
    else if (s.wait) await win.waitForTimeout(s.wait);
    else if (s.eval) await win.evaluate(s.eval);
    else if (s.log) console.log("log:", JSON.stringify(await win.evaluate(s.log)));
    else if (s.shot) await win.screenshot({ path: s.shot });
  }
}

/** fx.stub = stub.json for the fake yt-dlp (info, vttFile, ...). Returns the cwd for launchApp. */
function makeStubRoot(fx) {
  const os = require("node:os");
  const { execFileSync } = require("node:child_process");
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "parity-stub-"));
  execFileSync("node", [path.join(REPO, "audit", "harness", "make-stub-root.cjs"), root]);
  fs.writeFileSync(path.join(root, "stub.json"), JSON.stringify(fx.stub));
  fs.copyFileSync(path.join(REPO, "audit", "fixtures", "fixture.mp4"), path.join(root, "fixture.mp4"));
  if (fx.stub.vttFile) {
    fs.copyFileSync(path.join(REPO, "audit", "harness", "fixtures", fx.stub.vttFile), path.join(root, fx.stub.vttFile));
  }
  return root;
}

/**
 * What to capture of the app. --window: the board's visible part of the window frame (frame.clip).
 * --el: fixture.region, a selector or a rect, since a board drawing a drawer or a menu says nothing
 * about where that piece sits in the real window.
 */
async function appRegion(win, frame, fx, useWindow) {
  const r = fx.region;
  if (r && r.selector) {
    const box = await win.locator(r.selector).first().boundingBox();
    if (!box) throw new Error(`region selector ${r.selector} not found in the app`);
    return { x: Math.floor(box.x), y: Math.floor(box.y), width: Math.round(box.width), height: Math.round(box.height) };
  }
  if (r) return r;
  if (!useWindow) throw new Error("--el needs a fixture region (selector or x, y, width, height)");
  return frame.clip;
}

async function screenshotApp(screen, frame, fx, useWindow, dump) {
  const win0 = fx.window || (useWindow ? { width: frame.width, height: frame.height } : { width: 1360, height: 760 });
  const { launchApp } = require("../../audit/harness/app.cjs");
  // The packaged-shape app looks for binaries in <electron>/dist/resources/bin, not under cwd, so a
  // stub root is linked there for the run and removed after. One stubbed parity run at a time.
  let link = null;
  let stubRoot;
  if (fx.stub) {
    stubRoot = makeStubRoot(fx);
    link = path.join(REPO, "node_modules", "electron", "dist", "resources", "bin");
    fs.rmSync(link, { recursive: true, force: true });
    fs.symlinkSync(path.join(stubRoot, "resources", "bin"), link);
  }
  const a = await launchApp({ label: `parity-${screen}`, seed: fx.seed, cwd: stubRoot });
  try {
    // Size the real window's content area (setViewportSize alone does not move the Electron window).
    await a.app.evaluate(({ BrowserWindow }, [w, h]) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.webContents.getURL().includes("127.0.0.1") && !win.webContents.getURL().includes("localhost")) continue;
        win.setMinimumSize(1, 1);
        win.setContentSize(w, h);
      }
    }, [win0.width, win0.height]);
    await a.win.waitForTimeout(300);
    const inner = await a.win.evaluate(() => [innerWidth, innerHeight]);
    if (inner[0] !== win0.width || inner[1] !== win0.height) {
      console.warn(`window content is ${inner.join("x")}, wanted ${win0.width}x${win0.height}`);
    }
    if (fx.initScript) {
      // A script that must exist before the app's own code runs (the fake YouTube player), then a reload.
      const src = fs.readFileSync(path.join(REPO, "audit", "harness", "fixtures", fx.initScript), "utf8");
      const pre = fx.initGlobals ? `Object.assign(window, ${JSON.stringify(fx.initGlobals)});` : "";
      await a.win.context().addInitScript(pre + src);
      await a.win.reload();
    }
    await a.win.waitForSelector(fx.waitFor || "#root *");
    await runSteps(a.win, fx.steps);
    await a.win.waitForTimeout(400);
    const clip = await appRegion(a.win, frame, fx, useWindow);
    if (dump) {
      const f = require("./dumpLayout.cjs").DUMP_SRC;
      const d = await a.win.evaluate(new Function("p", "return (" + f + ")(p[0], p[1])"), [0, 0]).catch(() => null);
      globalThis.__appDump = d;
    }
    return await a.win.screenshot({ clip });
  } finally {
    await a.close();
    if (link) fs.rmSync(link, { recursive: true, force: true });
  }
}

(async () => {
  const o = args();
  const outDir = path.join(REPO, "audit", "out", "parity", o.screen + (o.window !== undefined ? `-window${o.window}` : o.el !== undefined ? `-el${o.el}` : ""));
  fs.mkdirSync(outDir, { recursive: true });
  const { png: boardPng, frame, dump: boardDump } = await renderBoard(o.screen, { window: o.window, el: o.el, dump: o.dump });
  if (boardDump) fs.writeFileSync(path.join(outDir, "board.json"), JSON.stringify(boardDump, null, 1));
  fs.writeFileSync(path.join(outDir, "board.png"), boardPng);
  console.log(`board: ${frame.title} (${frame.width}x${frame.height})`);
  if (o.boardOnly) return;

  const fixture = loadFixture(o.fixture);
  const appPng = await screenshotApp(o.screen, frame, fixture, o.window !== undefined, o.dump);
  if (o.dump && globalThis.__appDump) fs.writeFileSync(path.join(outDir, "app.json"), JSON.stringify(globalThis.__appDump, null, 1));
  fs.writeFileSync(path.join(outDir, "app.png"), appPng);
  let b = PNG.sync.read(boardPng);
  let p = PNG.sync.read(appPng);
  if (b.width !== p.width || b.height !== p.height) {
    if (o.el === undefined) throw new Error(`size mismatch: board ${b.width}x${b.height}, app ${p.width}x${p.height}`);
    // A drawn piece (drawer, menu) is the height of its content on the board but fills the window in the
    // app: compare the part both have, from the top left, and say so.
    const w = Math.min(b.width, p.width);
    const h = Math.min(b.height, p.height);
    const cut = (img) => { const out = new PNG({ width: w, height: h }); PNG.bitblt(img, out, 0, 0, w, h, 0, 0); return out; };
    console.log(`sizes differ (board ${b.width}x${b.height}, app ${p.width}x${p.height}); comparing the top ${w}x${h}`);
    b = cut(b);
    p = cut(p);
  }
  // Regions neither side can honestly show (the video picture, which needs YouTube): painted the same
  // flat colour on both, so they never count as a difference. Rects are relative to the compared image.
  for (const m of fixture.mask || []) {
    for (const img of [b, p]) {
      for (let y = m.y; y < Math.min(img.height, m.y + m.height); y++) {
        for (let x = m.x; x < Math.min(img.width, m.x + m.width); x++) {
          const i = (img.width * y + x) << 2;
          img.data[i] = 40; img.data[i + 1] = 40; img.data[i + 2] = 40; img.data[i + 3] = 255;
        }
      }
    }
  }
  const diff = new PNG({ width: b.width, height: b.height });
  const bad = pixelmatch(b.data, p.data, diff.data, b.width, b.height, { threshold: o.threshold, includeAA: false });
  fs.writeFileSync(path.join(outDir, "diff.png"), PNG.sync.write(diff));

  // board | app | diff side by side, 8px gutters.
  const g = 8;
  const sheet = new PNG({ width: b.width * 3 + g * 2, height: b.height });
  sheet.data.fill(0);
  [b, p, diff].forEach((img, i) => PNG.bitblt(img, sheet, 0, 0, img.width, img.height, i * (b.width + g), 0));
  fs.writeFileSync(path.join(outDir, "side-by-side.png"), PNG.sync.write(sheet));
  const pct = ((bad / (b.width * b.height)) * 100).toFixed(2);
  console.log(`diff: ${bad} px (${pct}%) -> ${outDir}/side-by-side.png`);
  process.exitCode = bad === 0 ? 0 : 1;
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
