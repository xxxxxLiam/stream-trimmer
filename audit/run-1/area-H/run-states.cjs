/**
 * File: run-states.cjs
 * Path: audit/run-1/area-H/run-states.cjs
 * Description: Area H pass 4 — the states the first sweep could not reach:
 *   both sign-in modals, the loading state, the error state, download
 *   progress, the saved toast, the channel-data screen, and a populated bank
 *   and campaign list. Contrast, semantics and token drift for each.
 *   Audit-only.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch } = require("./lib/launch.cjs");
const { buildStubRoot, script } = require("./lib/stub.cjs");
const { setSize, measure, inject } = require("./lib/drive.cjs");
const { closeAll, jsClick, URL_OK } = require("./lib/states.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB_OK = path.join(SCRATCH, "stubH-ok");
const STUB_NOAUTH = path.join(SCRATCH, "stubH-noauth");
const BASE = "/home/user/stream-trimmer/audit/run-1/area-H/out";
const DATA = path.join(BASE, "data");

const YTDLP_ERROR =
  "ERROR: [youtube] stub0000001: Video unavailable. This video is not available\n" +
  "ERROR: unable to download video data: HTTP Error 403: Forbidden";

/** Put a URL in the bar, expanding the collapsed source chip first if needed. */
async function setUrl(a, url) {
  const has = await a.win.evaluate(() => Boolean(document.querySelector('input[type="url"]')));
  if (!has) {
    await a.win.evaluate(() => {
      const b = [...document.querySelectorAll("#ui-source-chip button")].find((x) => /Change/i.test(x.innerText));
      b?.click();
    });
    await a.win.waitForTimeout(500);
  }
  await a.win.fill('input[type="url"]', url);
  await a.win.keyboard.press("Enter");
}

async function grab(a, name, results) {
  await a.win.waitForTimeout(400);
  const shot = await a.shot(name);
  const m = await measure(a, name);
  m.tokens = await a.win.evaluate(() => window.__H.tokens());
  m.shot = shot;
  results.push(m);
  const bad = m.text.filter((t) => !t.pass && t.bothFail);
  console.log(
    `${name.padEnd(26)} text=${String(m.text.length).padStart(4)} FAIL=${String(bad.length).padStart(2)}` +
    ` iconFail=${m.icons.filter((i) => !i.pass).length} bars=${m.scrollers.filter((s) => s.visibleBar).length}` +
    ` sem=${m.semantics.issues.length} live=${m.semantics.live.length}`,
  );
  for (const t of bad) {
    console.log(`    ! "${t.text.slice(0, 44)}" ${t.colorHex} on ${t.bgPixelHex} ${t.fontSize}px = ${t.ratio}:1 (css ${t.ratioCss}) need ${t.need}`);
  }
  return m;
}

(async () => {
  buildStubRoot(STUB_OK); buildStubRoot(STUB_NOAUTH);
  script(STUB_NOAUTH, { authFail: true });
  script(STUB_OK, { authFail: false, exitCode: 0, delayMs: 0, info: { id: "stub0000001", title: "Stub video", duration: 3600, uploader: "Stub channel" } });
  fs.mkdirSync(DATA, { recursive: true });
  const results = [];

  // ---- 1. sign-in modal, fresh install ----------------------------------
  {
    const a = await launch({ label: "H-st-modal", cwd: STUB_NOAUTH, outDir: path.join(BASE, "states-modal"), seed: {} });
    await a.win.waitForTimeout(9000);
    await setSize(a, 1440, 900);
    await grab(a, "signin-modal-fresh", results);
    // Open the two disclosures inside it.
    await a.win.evaluate(() => {
      document.querySelectorAll("details").forEach((d) => (d.open = true));
      [...document.querySelectorAll("button")].find((b) => /Pick a browser/i.test(b.innerText))?.click();
    });
    await grab(a, "signin-modal-expanded", results);
    await a.close();
  }

  // ---- 2. expired sign-in ------------------------------------------------
  {
    const past = Math.floor(Date.now() / 1000) - 3 * 24 * 3600;
    const a = await launch({ label: "H-st-exp", cwd: STUB_NOAUTH, outDir: path.join(BASE, "states-expired"), signedIn: true, cookieExpiry: past, seed: {} });
    await a.win.waitForTimeout(9000);
    await setSize(a, 1440, 900);
    await grab(a, "signin-modal-expired", results);
    await a.close();
  }

  // ---- 3. loading, error, progress, toast, channel, bank -----------------
  {
    const seed = {
      "clipper.campaigns": [
        { id: "c1", name: "Launch week", format: "mp4", quality: "1080", clipsDir: "/home/user/Clips", dataDir: "/home/user/Data", dataDirConfirmed: false, pattern: "{id}", used: [], createdAt: Date.now() },
        { id: "c2", name: "Evergreen", format: "mp3", quality: "320", clipsDir: "", dataDir: "", dataDirConfirmed: false, pattern: "{id}", used: [], createdAt: Date.now() },
      ],
      "clipper.activeCampaign": "c1",
      "clipper.bank": [
        { id: "LW-001", videoId: "stub0000001", label: "Opening hook", tier: "A", category: "hook", segments: [{ start: 10, end: 25 }], cut: false, createdAt: Date.now() },
        { id: "LW-002", videoId: "stub0000001", label: "The part where it all goes wrong and nobody can explain why", tier: "B", category: "story", segments: [{ start: 100, end: 140 }], cut: true, createdAt: Date.now() },
        { id: "LW-003", videoId: "stub0000001", label: "Close", tier: "C", category: "cta", segments: [{ start: 300, end: 310 }], cut: false, createdAt: Date.now() },
      ],
    };
    const a = await launch({ label: "H-st-main", cwd: STUB_OK, outDir: path.join(BASE, "states-main"), signedIn: true, seed });
    await a.win.waitForTimeout(7000);
    await setSize(a, 1440, 900);

    await grab(a, "workspace-with-campaign", results);
    await jsClick(a.win, "#ui-campaign-chip");
    await grab(a, "campaign-popover-populated", results);
    await closeAll(a.win);

    // Loading
    script(STUB_OK, { delayMs: 9000 });
    await setUrl(a, URL_OK);
    await a.win.waitForTimeout(1500);
    await grab(a, "video-loading", results);
    await a.win.waitForTimeout(9000);

    // Error
    script(STUB_OK, { delayMs: 0, exitCode: 1, stderr: YTDLP_ERROR });
    await setUrl(a, "https://www.youtube.com/watch?v=stub0000099");
    await a.win.waitForTimeout(4000);
    await grab(a, "video-error", results);

    // Healthy video, then cut -> progress -> toast
    script(STUB_OK, { exitCode: 0, stderr: "", delayMs: 0, progress: [0, 10, 35, 70, 100] });
    await setUrl(a, URL_OK);
    await a.win.waitForTimeout(4500);
    await grab(a, "video-loaded", results);

    await a.win.evaluate(() => document.querySelector("#ui-mark-whole")?.click());
    await a.win.waitForTimeout(400);
    await a.win.evaluate(() => document.querySelector("#ui-add-segment")?.click());
    await a.win.waitForTimeout(400);
    await grab(a, "segment-added", results);
    await a.win.evaluate(() => document.querySelector("#ui-cut")?.click());
    await a.win.waitForTimeout(1200);
    await grab(a, "download-progress", results);
    await a.win.waitForTimeout(12000);
    await grab(a, "after-cut", results);

    // Clips column tabs with content
    await a.win.evaluate(() => document.querySelector("#clips-tab-bank")?.click());
    await grab(a, "bank-populated", results);
    await a.win.evaluate(() => document.querySelector("#clips-tab-all")?.click());
    await grab(a, "all-saved-populated", results);

    // Channel data screen (owner build)
    const hasChannel = await a.win.evaluate(() => Boolean(document.querySelector("#ui-channel-link")));
    if (hasChannel) {
      await jsClick(a.win, "#ui-channel-link");
      await a.win.waitForTimeout(900);
      await grab(a, "channel-data", results);
      await a.win.evaluate(() => [...document.querySelectorAll("button")].find((b) => /Back to clipping/i.test(b.innerText))?.click());
      await a.win.waitForTimeout(600);
    } else {
      console.log("channel-data: link absent in this build");
    }
    await a.close();
  }

  fs.writeFileSync(path.join(DATA, "states.json"), JSON.stringify({ results }, null, 2));
  console.log("wrote", path.join(DATA, "states.json"));
})().catch((e) => { console.error("FAIL", e); process.exit(1); });
