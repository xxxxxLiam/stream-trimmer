/**
 * File: run-layout.cjs
 * Path: audit/run-1/area-H/run-layout.cjs
 * Description: Area H pass 2 — layout at 900x700, 1024x768, 1280x800,
 *   1440x900 and 1920x1080, plus 150% and 200% zoom, plus the long-string
 *   case. Records where every critical control actually lands. Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot } = require("./lib/stub.cjs");
const { setSize, inject } = require("./lib/drive.cjs");
const { closeAll, jsClick, URL_OK } = require("./lib/states.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB = path.join(SCRATCH, "stubH2");
const BASE = "/home/user/stream-trimmer/audit/run-1/area-H/out";
const DATA = path.join(BASE, "data");

const SIZES = [[900, 700], [1024, 768], [1280, 800], [1440, 900], [1920, 1080]];
const LONG_TITLE =
  "Why the 1998 Ruling on Riparian Water Rights in the Upper Colorado Basin Still Governs Every Municipal Allocation Decision Made West of the Hundredth Meridian Today — Full Lecture, Part Three";
const LONG_CAMPAIGN = "Q4 Shorts — Longform Lecture Series Reels, Vertical Cutdowns, Weekly Batch (Team B)";

async function readLayout(a, tag, label) {
  await inject(a.win);
  const d = await a.win.evaluate(() => ({
    layout: window.__H.layout(),
    critical: window.__H.critical(),
    scrollers: window.__H.scrollers().filter((s) => s.visibleBar),
    overlaps: window.__H.overlaps(),
  }));
  const shot = await a.shot(tag);
  const off = d.critical.filter((c) => c.present && !c.fullyVisible);
  console.log(
    `${label.padEnd(34)} vw=${d.layout.vw}x${d.layout.vh} hScroll=${d.layout.hScroll}` +
    ` bars=${d.scrollers.length} clipped=${d.layout.clipped.length} offRight=${d.layout.offRight.length}` +
    ` offscreenCritical=[${off.map((c) => c.label + (c.belowFold ? ":below" : ":part")).join(", ")}]`,
  );
  return { tag, label, shot, ...d };
}

(async () => {
  buildStubRoot(STUB);
  fs.mkdirSync(DATA, { recursive: true });
  const runs = [];

  // ---- A. plain signed-in workspace at every size ------------------------
  {
    const a = await launch({ label: "H-layout", cwd: STUB, outDir: path.join(BASE, "layout"), signedIn: true, seed: {} });
    await a.win.waitForTimeout(6000);
    for (const [w, h] of SIZES) {
      const got = await setSize(a, w, h);
      runs.push(await readLayout(a, `empty-${w}x${h}`, `empty ${w}x${h} (got ${got.w}x${got.h})`));
    }
    // With a video loaded: the state a clipper actually works in.
    await setSize(a, 1280, 800);
    await a.win.fill('input[type="url"]', URL_OK);
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(4000);
    for (const [w, h] of SIZES) {
      await setSize(a, w, h);
      runs.push(await readLayout(a, `loaded-${w}x${h}`, `loaded ${w}x${h}`));
    }
    // Help drawer open on top of a loaded video — the worst horizontal case.
    await setSize(a, 1280, 800);
    await jsClick(a.win, "#ui-help-button");
    await a.win.waitForTimeout(600);
    for (const [w, h] of [[1024, 768], [1280, 800], [1440, 900]]) {
      await setSize(a, w, h);
      runs.push(await readLayout(a, `help-${w}x${h}`, `help+video ${w}x${h}`));
    }
    await closeAll(a.win);

    // ---- zoom ------------------------------------------------------------
    for (const z of [1.5, 2]) {
      await setSize(a, 1280, 800);
      await a.win.evaluate((zz) => { document.documentElement.style.zoom = String(zz); }, z);
      await a.win.waitForTimeout(700);
      runs.push(await readLayout(a, `zoom-${z * 100}`, `zoom ${z * 100}% @1280x800`));
    }
    // Does the app respond to a larger base font at all (OS text-size setting)?
    await a.win.evaluate(() => { document.documentElement.style.zoom = ""; document.documentElement.style.fontSize = "24px"; });
    await a.win.waitForTimeout(500);
    const fontProbe = await a.win.evaluate(() => {
      const el = document.querySelector("#ui-col-transcript h2, h2");
      return { rootFontSize: getComputedStyle(document.documentElement).fontSize, headingPx: el ? getComputedStyle(el).fontSize : null, bodyPx: getComputedStyle(document.body).fontSize };
    });
    console.log("base-font probe:", JSON.stringify(fontProbe));
    runs.push({ tag: "base-font-24px", label: "html font-size 24px", fontProbe, shot: await a.shot("base-font-24px") });
    await a.close();
  }

  // ---- B. long strings ---------------------------------------------------
  {
    const seed = {
      "clipper.campaigns": [{
        id: "c1", name: LONG_CAMPAIGN, format: "mp4", quality: "best",
        clipsDir: "/home/user/Videos/Clips/Q4 Shorts Longform Lecture Series Reels Vertical Cutdowns Weekly Batch Team B",
        dataDir: "/home/user/Videos/ChannelData/Q4 Shorts Longform Lecture Series", dataDirConfirmed: false,
        pattern: "{id}", used: [], createdAt: Date.now(),
      }],
      "clipper.activeCampaign": "c1",
    };
    const a = await launch({ label: "H-long", cwd: STUB, outDir: path.join(BASE, "long"), signedIn: true, seed });
    await a.win.waitForTimeout(6000);
    const stubJson = path.join(STUB, "stub.json");
    const cfg = JSON.parse(fs.readFileSync(stubJson, "utf8"));
    fs.writeFileSync(stubJson, JSON.stringify({ ...cfg, info: { ...cfg.info, title: LONG_TITLE } }, null, 2));
    await setSize(a, 1280, 800);
    await a.win.fill('input[type="url"]', URL_OK);
    await a.win.keyboard.press("Enter");
    await a.win.waitForTimeout(4500);
    for (const [w, h] of [[900, 700], [1024, 768], [1280, 800], [1920, 1080]]) {
      await setSize(a, w, h);
      runs.push(await readLayout(a, `long-${w}x${h}`, `LONG strings ${w}x${h}`));
    }
    await a.close();
  }

  fs.writeFileSync(path.join(DATA, "layout.json"), JSON.stringify({ runs }, null, 2));
  console.log("wrote", path.join(DATA, "layout.json"));
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
