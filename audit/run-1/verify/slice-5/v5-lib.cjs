/**
 * File: v5-lib.cjs
 * Path: audit/run-1/verify/slice-5/v5-lib.cjs
 * Description: Slice-5 verification helpers, written from the findings' own
 *   Steps rather than reused from any area's scaffolding. Cold start per call:
 *   launchApp() already mints a fresh --user-data-dir.
 *
 *   Audit-only; changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const STUB = process.env.V5_STUB || "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stub5";
const OUT = "/home/user/stream-trimmer/audit/run-1/verify/slice-5/out";
const VID = "stub0000001";
const URL1 = `https://www.youtube.com/watch?v=${VID}`;

/** A synthetic Netscape cookies.txt that electron/cookieState.cjs reads as a
 *  live YouTube sign-in. Needed because the launch-time restore only probes
 *  the server when a cookie file is actually on disk. */
function cookieText(expiresAtSec) {
  const exp = expiresAtSec || Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  return [
    "# Netscape HTTP Cookie File",
    `.youtube.com\tTRUE\t/\tTRUE\t${exp}\tSID\tsynthetic-audit-value`,
    `.youtube.com\tTRUE\t/\tTRUE\t${exp}\t__Secure-3PSID\tsynthetic-audit-value`,
    "",
  ].join("\n");
}

function setStub(patch) {
  const file = path.join(STUB, "stub.json");
  const cur = JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify({ ...cur, ...patch }, null, 2));
}

/**
 * Cold start. `signedIn:false` leaves the real sign-in modal up (H-2).
 * Otherwise a cookie file is dropped in the fresh user-data dir before the
 * window appears and the stub answers the probe as signed in, so the workspace
 * is reachable without hiding anything in the DOM.
 */
async function boot(label, { seed = {}, signedIn = true, viewport = null } = {}) {
  setStub({ signedIn });
  let last;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const a = await launchApp({
        label,
        cwd: STUB,
        outDir: path.join(OUT, label),
        seed: { "clipper.dataDirConfirmed": true, ...seed },
      });
      if (signedIn) {
        fs.writeFileSync(path.join(a.userDataDir, "yt-cookies.txt"), cookieText());
      }
      // `header:visible` rather than `header`: with many workspace tabs seeded
      // every tab mounts its own header and the first one in the DOM is hidden.
      // Generous default: the clip-bank performance cases genuinely block the
      // renderer's main thread for seconds at a time, and a 30s default would
      // turn a slow app into a failed script.
      a.win.setDefaultTimeout(180000);
      await a.win.waitForSelector("header:visible", { timeout: 40000 });
      if (viewport) await a.win.setViewportSize(viewport);
      if (signedIn) {
        // The restore runs at launch; the cookie file may land a beat later, so
        // nudge a re-check through the renderer's own public API if needed.
        await a.win
          .waitForFunction(
            () => !document.querySelector('[aria-labelledby="youtube-connect-title"]'),
            null,
            { timeout: 25000 },
          )
          .catch(() => {});
      }
      return a;
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
  throw last;
}

/** Paste a link into the URL bar and wait for the video to load. */
async function loadVideo(a, url = URL1) {
  const input = a.win.locator('#ui-source-chip input[type="url"]');
  await input.waitFor({ timeout: 25000 });
  await input.fill(url);
  await a.win.keyboard.press("Enter");
  await a.win.waitForSelector("#ui-col-clips", { timeout: 30000 });
  await a.win
    .waitForFunction(
      () => !document.body.innerText.includes("Paste a link to see this video's clips."),
      null,
      { timeout: 30000 },
    )
    .catch(() => {});
}

/** Bounding rect of a selector, in CSS px, plus whether it clears the fold. */
async function rect(a, sel) {
  return a.win.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return {
      sel: s,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      left: Math.round(r.left),
      width: Math.round(r.width),
      vh: window.innerHeight,
      vw: window.innerWidth,
      fullyBelowFold: r.top >= window.innerHeight,
      partlyBelowFold: r.bottom > window.innerHeight,
    };
  }, sel);
}

function campaign(id, name, over = {}) {
  return {
    id,
    name,
    targetMinSec: 30,
    targetMaxSec: 60,
    hardMaxSec: 90,
    clipIdPattern: "{prefix}-{videoId}-{nn}",
    prefix: name.slice(0, 2).toUpperCase(),
    format: "mp4",
    quality: "best",
    clipsDir: `/tmp/clips-${id}`,
    dataDir: `/tmp/data-${id}`,
    usedRanges: {},
    ...over,
  };
}

function log(...args) {
  console.log(...args);
}

module.exports = { boot, loadVideo, rect, campaign, setStub, cookieText, log, STUB, OUT, VID, URL1 };
