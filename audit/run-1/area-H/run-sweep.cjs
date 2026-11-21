/**
 * File: run-sweep.cjs
 * Path: audit/run-1/area-H/run-sweep.cjs
 * Description: Area H pass 1 — contrast, semantics, scrollbars, overlap and
 *   layout for every reachable screen and overlay, measured on the real
 *   rendered pixels at 1440x900. Audit-only; no product code is touched.
 *
 * Usage: xvfb-run -a --server-args="-screen 0 1920x1200x24" \
 *          node audit/run-1/area-H/run-sweep.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot } = require("./lib/stub.cjs");
const { setSize, measure } = require("./lib/drive.cjs");
const { STATES, closeAll } = require("./lib/states.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB = path.join(SCRATCH, "stubH2");
const BASE = "/home/user/stream-trimmer/audit/run-1/area-H/out";
const DATA = path.join(BASE, "data");

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const out = path.join(BASE, "sweep");
  const a = await launch({ label: "H-sweep", cwd: STUB, outDir: out, signedIn: true, seed: {} });
  await a.win.waitForTimeout(6000);
  const vp = await setSize(a, 1440, 900);
  console.log("viewport", JSON.stringify(vp));

  const results = [];
  for (const st of STATES) {
    await closeAll(a.win);
    try {
      await st.open(a.win);
    } catch (e) {
      console.log(`!! ${st.name}: could not open — ${e.message}`);
      results.push({ state: st.name, error: e.message });
      continue;
    }
    await a.win.waitForTimeout(700);
    const shot = await a.shot(st.name);
    const m = await measure(a, st.name);
    m.shot = shot;
    results.push(m);
    const fails = m.text.filter((t) => !t.pass).length;
    console.log(
      `${st.name.padEnd(24)} text=${String(m.text.length).padStart(4)} failing=${String(fails).padStart(3)}` +
      ` icons=${m.icons.length} iconFail=${m.icons.filter((i) => !i.pass).length}` +
      ` scrollbars=${m.scrollers.filter((s) => s.visibleBar).length}` +
      ` sem=${m.semantics.issues.length} overlaps=${m.overlaps.length} clipped=${m.layout.clipped.length}`,
    );
  }

  // Tokens and motion once: they are app-wide, not per state.
  await closeAll(a.win);
  const { inject } = require("./lib/drive.cjs");
  await inject(a.win);
  const tokens = await a.win.evaluate(() => window.__H.tokens());
  const motion = await a.win.evaluate(() => window.__H.motion());
  const build = await a.win.evaluate(() => ({
    channelLink: Boolean(document.querySelector("#ui-channel-link")),
    ua: navigator.userAgent,
    dpr: window.devicePixelRatio,
  }));

  fs.writeFileSync(path.join(DATA, "sweep.json"), JSON.stringify({ vp, results, tokens, motion, build }, null, 2));
  console.log("\nchannel link present:", build.channelLink, "dpr:", build.dpr);
  console.log("wrote", path.join(DATA, "sweep.json"));
  await a.close();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
