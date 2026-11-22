/**
 * File: smoke.cjs
 * Path: audit/run-2/area-H/smoke.cjs
 * Description: Area H run-2 smoke test. Confirms the launcher gets past the
 *   sign-in gate, the probe injects, and the real window can be resized.
 *   Audit-only; no product code is touched.
 */
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot } = require("./lib/stub.cjs");
const { inject, setSize } = require("./lib/drive.cjs");

const OUT = path.join(__dirname, "out");
const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubH2R2";

(async () => {
  buildStubRoot(STUB);
  const a = await launch({
    label: "h2-smoke",
    outDir: path.join(OUT, "smoke"),
    cwd: STUB,
    signedIn: true,
    seed: { "clipper.dataDirConfirmed": true },
  });
  await a.win.waitForSelector("header", { timeout: 20000 });
  await a.win.waitForTimeout(1200);
  await inject(a.win);
  const info = await a.win.evaluate(() => ({
    vw: window.innerWidth,
    vh: window.innerHeight,
    modal: Boolean(document.querySelector('[role="dialog"][aria-modal="true"]')),
    helpBtn: Boolean(document.querySelector("#ui-help-button")),
    helpBtnParent: document.querySelector("#ui-help-button")?.parentElement?.tagName || null,
    colsHost: Boolean(document.querySelector(".cols-host")),
    threeCols: getComputedStyle(document.querySelector(".cols-row")).flexWrap,
  }));
  console.log("initial", JSON.stringify(info));
  const sz = await setSize(a, 900, 600);
  console.log("after resize to 900x600:", JSON.stringify(sz));
  console.log("shot", await a.shot("smoke"));
  await a.close();
})().catch((e) => { console.error("FAILED", e); process.exit(1); });
