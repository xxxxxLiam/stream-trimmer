/**
 * File: run-download.cjs
 * Path: audit/run-1/area-H/run-download.cjs
 * Description: Area H pass 6 — a genuine in-flight download, so the progress
 *   UI can be measured for live regions, progressbar semantics and contrast
 *   rather than reasoned about. Also captures the clipped bank-search
 *   placeholder. Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot, script } = require("./lib/stub.cjs");
const { setSize, inject, measure } = require("./lib/drive.cjs");
const { URL_OK } = require("./lib/states.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB = path.join(SCRATCH, "stubH-dl");
const BASE = "/home/user/stream-trimmer/audit/run-1/area-H/out";
const DATA = path.join(BASE, "data");

(async () => {
  buildStubRoot(STUB);
  script(STUB, { authFail: false, exitCode: 0, delayMs: 0, progress: [0, 5, 12, 25, 40, 60, 80, 95, 100] });
  fs.mkdirSync(DATA, { recursive: true });
  const out = {};

  const clipsDir = path.join(SCRATCH, "clips-H");
  fs.mkdirSync(clipsDir, { recursive: true });
  const a = await launch({
    label: "H-dl", cwd: STUB, outDir: path.join(BASE, "download"), signedIn: true,
    seed: {
      "clipper.saveDir": clipsDir, "clipper.clipsDir": clipsDir,
      "clipper.campaigns": [{ id: "c1", name: "Launch week", format: "mp4", quality: "best", clipsDir, dataDir: path.join(SCRATCH, "data-H"), dataDirConfirmed: true, pattern: "{id}", used: [], createdAt: Date.now() }],
      "clipper.activeCampaign": "c1",
    },
  });
  await a.win.waitForTimeout(7000);
  await setSize(a, 1440, 900);
  await a.win.fill('input[type="url"]', URL_OK);
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(4500);

  // Mark 00:00:05 -> 00:00:12 the way a keyboard user would, then add + cut.
  await a.win.fill("#ui-mark-in", "00:00:05");
  await a.win.fill("#ui-mark-out", "00:00:12");
  await a.win.evaluate(() => document.querySelector("#ui-mark-in").blur());
  await a.win.waitForTimeout(400);
  await a.win.evaluate(() => document.querySelector("#ui-add-segment")?.click());
  await a.win.waitForTimeout(600);
  out.segment = await a.win.evaluate(() => ({
    total: document.querySelector("#ui-stitched-total")?.textContent,
    cutDisabled: document.querySelector("#ui-cut")?.disabled,
  }));
  console.log("after add segment:", JSON.stringify(out.segment));
  await a.shot("segment-ready");

  await a.win.evaluate(() => document.querySelector("#ui-cut")?.click());
  const samples = [];
  for (let i = 0; i < 10; i++) {
    await a.win.waitForTimeout(500);
    await inject(a.win);
    const s = await a.win.evaluate(() => {
      const live = [...document.querySelectorAll("[aria-live], [role=status], [role=alert], [role=progressbar], [role=log]")]
        .filter((e) => e.getBoundingClientRect().height > 0)
        .map((e) => ({ role: e.getAttribute("role"), live: e.getAttribute("aria-live"), text: (e.innerText || "").trim().replace(/\s+/g, " ").slice(0, 70) }));
      return {
        live,
        progressbar: document.querySelectorAll('[role="progressbar"]').length,
        valuenow: [...document.querySelectorAll("[aria-valuenow]")].map((e) => e.getAttribute("aria-valuenow")),
        barText: ([...document.querySelectorAll("footer, main *")].map((e) => e.children.length === 0 ? (e.textContent || "").trim() : "").filter((t) => /%/.test(t)))[0] || null,
      };
    });
    samples.push(s);
    if (i === 1) { out.midShot = await a.shot("download-mid"); out.mid = await measure(a, "download-mid"); }
  }
  out.samples = samples;
  console.log("progressbar elements seen:", [...new Set(samples.map((s) => s.progressbar))]);
  console.log("aria-valuenow seen:", JSON.stringify([...new Set(samples.flatMap((s) => s.valuenow))]));
  console.log("percent text seen:", JSON.stringify([...new Set(samples.map((s) => s.barText).filter(Boolean))]));
  console.log("live region texts:");
  for (const t of [...new Set(samples.flatMap((s) => s.live.map((l) => `${l.role || l.live}: ${l.text}`)))]) console.log("   " + t);

  await a.win.waitForTimeout(8000);
  out.afterShot = await a.shot("download-done");
  out.after = await measure(a, "download-done");
  out.toast = await a.win.evaluate(() => {
    const t = document.querySelector('[role="status"]');
    return { statusText: t ? (t.innerText || "").trim().slice(0, 80) : null, files: null };
  });
  out.savedFiles = fs.existsSync(clipsDir) ? fs.readdirSync(clipsDir) : [];
  console.log("files written:", JSON.stringify(out.savedFiles));
  console.log("after-cut status region:", JSON.stringify(out.toast));

  // Clipped bank-search placeholder.
  await a.win.evaluate(() => document.querySelector("#clips-tab-bank")?.click());
  await a.win.waitForTimeout(500);
  await inject(a.win);
  out.bankSearch = await a.win.evaluate(() => {
    const i = [...document.querySelectorAll("#clips-panel input")].find((x) => /Search the bank/.test(x.placeholder || ""));
    if (!i) return null;
    const cv = document.createElement("canvas").getContext("2d");
    cv.font = getComputedStyle(i).font;
    return {
      placeholder: i.placeholder,
      inputWidthPx: Math.round(i.getBoundingClientRect().width),
      textWidthPx: Math.round(cv.measureText(i.placeholder).width),
      paddingLeft: getComputedStyle(i).paddingLeft, paddingRight: getComputedStyle(i).paddingRight,
      ariaLabel: i.getAttribute("aria-label"),
    };
  });
  out.bankShot = await a.shot("bank-search-clipped");
  console.log("bank search placeholder:", JSON.stringify(out.bankSearch));

  fs.writeFileSync(path.join(DATA, "download.json"), JSON.stringify(out, null, 2));
  console.log("wrote", path.join(DATA, "download.json"));
  await a.close();
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
