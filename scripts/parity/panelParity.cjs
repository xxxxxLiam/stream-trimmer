/**
 * File: panelParity.cjs
 * Path: scripts/parity/panelParity.cjs
 * Description: `node scripts/parity/panelParity.cjs <Board> <fixture> <text> [selector]` compares ONE panel
 *   of a board with the same panel in the real app, element to element. The board's panel is the
 *   smallest 14px-radius frame containing <text>; the app's is `selector` (default: the section that holds
 *   the Export tab). Writes board | app | diff to audit/out/parity/<Board>-panel/. The board is read from
 *   the pending snapshot unless PARITY_SNAPSHOT is set. Needs a built app and xvfb-run, like parity.cjs.
 */
const fs = require("node:fs");
const path = require("node:path");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch");

const REPO = path.resolve(__dirname, "..", "..");
const [board, fixtureName, text, selector = "section:has(#panel-tab-export)"] = process.argv.slice(2);
if (!board || !fixtureName || !text) {
  console.error("usage: node scripts/parity/panelParity.cjs <Board> <fixture> <text> [selector]");
  process.exit(2);
}
process.env.PARITY_SNAPSHOT = process.env.PARITY_SNAPSHOT || "pending";
const { renderBoardPanel } = require("./boardRender.cjs");
const { screenshotElement } = require("./panelApp.cjs");

(async () => {
  const outDir = path.join(REPO, "audit", "out", "parity", `${board}-panel`);
  fs.mkdirSync(outDir, { recursive: true });
  const { png: boardPng, boxes: boardBoxes } = await renderBoardPanel(board, text);
  fs.writeFileSync(path.join(outDir, "board.png"), boardPng);
  const { png: appPng, boxes: appBoxes } = await screenshotElement(board, fixtureName, selector);
  fs.writeFileSync(path.join(outDir, "boxes.json"), JSON.stringify({ board: boardBoxes, app: appBoxes }, null, 1));
  fs.writeFileSync(path.join(outDir, "app.png"), appPng);
  const b = PNG.sync.read(boardPng);
  const p = PNG.sync.read(appPng);
  console.log(`board panel ${b.width}x${b.height}, app panel ${p.width}x${p.height}`);
  const w = Math.min(b.width, p.width);
  const h = Math.min(b.height, p.height);
  const cut = (img) => { const o = new PNG({ width: w, height: h }); PNG.bitblt(img, o, 0, 0, w, h, 0, 0); return o; };
  const bc = cut(b);
  const pc = cut(p);
  const diff = new PNG({ width: w, height: h });
  const bad = pixelmatch(bc.data, pc.data, diff.data, w, h, { threshold: 0.1, includeAA: false });
  fs.writeFileSync(path.join(outDir, "diff.png"), PNG.sync.write(diff));
  const g = 8;
  const sheet = new PNG({ width: w * 3 + g * 2, height: h });
  sheet.data.fill(0);
  [bc, pc, diff].forEach((img, i) => PNG.bitblt(img, sheet, 0, 0, w, h, i * (w + g), 0));
  fs.writeFileSync(path.join(outDir, "side-by-side.png"), PNG.sync.write(sheet));
  console.log(`diff: ${bad} px (${((bad / (w * h)) * 100).toFixed(2)}%) over the top ${w}x${h} -> ${outDir}/side-by-side.png`);
  process.exitCode = bad === 0 ? 0 : 1;
})().catch((e) => {
  console.error(e);
  process.exit(2);
});
