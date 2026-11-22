/**
 * File: run-zoom.cjs
 * Path: audit/run-1/area-H/run-zoom.cjs
 * Description: Area H pass 2b — REAL browser zoom (Electron setZoomFactor, the
 *   same thing Ctrl+Plus does), which shrinks the CSS viewport rather than
 *   merely scaling a stylesheet. Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot } = require("./lib/stub.cjs");
const { setSize, inject } = require("./lib/drive.cjs");
const { URL_OK } = require("./lib/states.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB = path.join(SCRATCH, "stubH2");
const BASE = "/home/user/stream-trimmer/audit/run-1/area-H/out";
const DATA = path.join(BASE, "data");

async function setZoom(a, factor) {
  await a.app.evaluate(async ({ BrowserWindow }, f) => {
    const win = BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed()).pop();
    win.webContents.setZoomFactor(f);
  }, factor);
  await a.win.waitForTimeout(700);
}

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const a = await launch({ label: "H-zoom", cwd: STUB, outDir: path.join(BASE, "zoom"), signedIn: true, seed: {} });
  await a.win.waitForTimeout(6000);
  await setSize(a, 1280, 800);
  await a.win.fill('input[type="url"]', URL_OK);
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(4000);

  const runs = [];
  for (const [w, h] of [[1280, 800], [1440, 900]]) {
    for (const z of [1, 1.5, 2]) {
      await setSize(a, w, h);
      await setZoom(a, z);
      await inject(a.win);
      const d = await a.win.evaluate(() => ({
        css: { w: window.innerWidth, h: window.innerHeight },
        layout: window.__H.layout(),
        critical: window.__H.critical(),
        bars: window.__H.scrollers().filter((s) => s.visibleBar).map((s) => ({ path: s.path, gutterY: s.gutterY, hiddenY: s.hiddenY })),
      }));
      const tag = `zoom${z * 100}-${w}x${h}`;
      const shot = await a.shot(tag);
      const off = d.critical.filter((c) => c.present && !c.fullyVisible);
      const unreachable = off.filter((c) => !c.scrollerOverflow);
      console.log(
        `${tag.padEnd(20)} cssViewport=${d.css.w}x${d.css.h} hScroll=${d.layout.hScroll} bars=${d.bars.length}` +
        ` clipped=${d.layout.clipped.length}\n   offscreen=[${off.map((c) => c.label).join(", ")}]` +
        `\n   NOT-SCROLLABLE-TO=[${unreachable.map((c) => c.label).join(", ")}]`,
      );
      runs.push({ tag, zoom: z, window: { w, h }, shot, ...d });
    }
  }
  await setZoom(a, 1);
  fs.writeFileSync(path.join(DATA, "zoom.json"), JSON.stringify({ runs }, null, 2));
  console.log("wrote", path.join(DATA, "zoom.json"));
  await a.close();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
