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
  const out = { screen: null, fixture: null, threshold: 0.1, boardOnly: false };
  for (let i = 0; i < a.length; i++) {
    if (a[i] === "--fixture") out.fixture = a[++i];
    else if (a[i] === "--threshold") out.threshold = Number(a[++i]);
    else if (a[i] === "--board-only") out.boardOnly = true;
    else if (!out.screen) out.screen = a[i];
  }
  if (!out.screen) {
    console.error("usage: npm run parity -- <Screen> [--fixture name] [--threshold 0.1] [--board-only]");
    process.exit(2);
  }
  out.fixture = out.fixture || out.screen;
  return out;
}

/** Fixture: { seed, steps, waitFor }. seed is settings.json; steps are playwright page calls. */
function loadFixture(name) {
  const f = path.join(REPO, "audit", "harness", "fixtures", `${name}.json`);
  if (!fs.existsSync(f)) return { seed: {}, steps: [] };
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

async function runSteps(win, steps) {
  for (const s of steps || []) {
    if (s.click) await win.click(s.click);
    else if (s.fill) await win.fill(s.fill[0], s.fill[1]);
    else if (s.press) await win.keyboard.press(s.press);
    else if (s.waitFor) await win.waitForSelector(s.waitFor);
    else if (s.wait) await win.waitForTimeout(s.wait);
    else if (s.eval) await win.evaluate(s.eval);
  }
}

async function screenshotApp(screen, frame, fx) {
  const { launchApp } = require("../../audit/harness/app.cjs");
  const a = await launchApp({ label: `parity-${screen}`, seed: fx.seed });
  try {
    await a.win.setViewportSize({ width: frame.width, height: frame.height });
    await a.win.waitForSelector(fx.waitFor || "#root *");
    await runSteps(a.win, fx.steps);
    await a.win.waitForTimeout(400);
    return await a.win.screenshot({ clip: { x: 0, y: 0, width: frame.width, height: frame.height } });
  } finally {
    await a.close();
  }
}

(async () => {
  const o = args();
  const outDir = path.join(REPO, "audit", "out", "parity", o.screen);
  fs.mkdirSync(outDir, { recursive: true });
  const { png: boardPng, frame } = await renderBoard(o.screen);
  fs.writeFileSync(path.join(outDir, "board.png"), boardPng);
  console.log(`board: ${frame.title} (${frame.width}x${frame.height})`);
  if (o.boardOnly) return;

  const appPng = await screenshotApp(o.screen, frame, loadFixture(o.fixture));
  fs.writeFileSync(path.join(outDir, "app.png"), appPng);
  const b = PNG.sync.read(boardPng);
  const p = PNG.sync.read(appPng);
  if (b.width !== p.width || b.height !== p.height) throw new Error("size mismatch between board and app");
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
