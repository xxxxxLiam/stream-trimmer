/**
 * File: h2.cjs
 * Path: audit/run-2/area-H/lib/h2.cjs
 * Description: Area H run-2 shared driving helpers. Audit-only; no product
 *   code is read into, copied into or changed by any of this.
 *
 *   Getting past the sign-in gate: run 1's trick (a synthetic cookies.txt plus
 *   a stub answering yt-dlp's --simulate probe) no longer reaches `signed_in` on
 *   this tree — the chip reads "Sign-in expired" and the gate opens about 3.5 s
 *   after boot (see diag-signin.cjs output). So every run here gets past it the
 *   way a real user now can, through the product's own
 *   "Continue without signing in (360p)" button, exactly as audit/run-2/BRIEF.md
 *   instructs. Nothing is hidden, removed or suppressed in the DOM.
 */
const path = require("node:path");
const { launch } = require("./launch.cjs");
const { inject, setSize } = require("./drive.cjs");

const URL_OK = "https://www.youtube.com/watch?v=stub0000001";

/** Wait for the gate, then dismiss it with the product's own skip button. */
async function dismissGate(win, { timeout = 12000 } = {}) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const found = await win.evaluate(() => {
      const b = [...document.querySelectorAll("button")]
        .find((x) => /continue without signing in/i.test(x.innerText || ""));
      if (!b) return false;
      b.click();
      return true;
    });
    if (found) { await win.waitForTimeout(600); return true; }
    await win.waitForTimeout(300);
  }
  // No gate appeared at all (e.g. clipper.signInSkipped seeded) — fine.
  return false;
}

/** Still up? Used to assert the measurements below are not taken through a scrim. */
async function gateUp(win) {
  return win.evaluate(() => Boolean(
    document.querySelector('[role="dialog"][aria-modal="true"]') ||
    [...document.querySelectorAll("button")].some((x) => /continue without signing in/i.test(x.innerText || "")),
  ));
}

/**
 * Launch, wait for the header, get past the gate and settle.
 * `seed` is merged over the defaults. `skipSeeded` boots with the gate already
 * dismissed (T10's persisted skip), for runs that relaunch many times.
 */
async function open(opts = {}) {
  const a = await launch({
    signedIn: true,
    ...opts,
    seed: {
      "clipper.dataDirConfirmed": true,
      ...(opts.skipSeeded ? { "clipper.signInSkipped": true } : {}),
      ...(opts.seed || {}),
    },
  });
  await a.win.waitForSelector("header", { timeout: 25000 });
  await a.win.waitForTimeout(1500);
  if (!opts.keepGate) {
    await dismissGate(a.win);
    await a.win.waitForTimeout(800);
  }
  return a;
}

/** Paste a URL and wait until the mark bar is live (the In field stops being disabled). */
async function loadVideo(a, { timeout = 25000 } = {}) {
  await a.win.fill('input[type="url"]', URL_OK);
  await a.win.keyboard.press("Enter");
  await a.win.waitForFunction(
    () => { const el = document.querySelector("#ui-mark-in"); return el && !el.disabled; },
    undefined, { timeout },
  );
  await a.win.waitForTimeout(900);
}

/** Mark and add n segments. Needs a size where Add segment is reachable. */
async function addSegments(a, n) {
  for (let i = 0; i < n; i++) {
    const s = 2 + i * 4, e = s + 3;
    const f = (t) => `00:00:${String(t).padStart(2, "0")}`;
    await a.win.fill("#ui-mark-in", f(s));
    await a.win.fill("#ui-mark-out", f(e));
    await a.win.click("#ui-add-segment", { force: true });
    await a.win.waitForTimeout(350);
  }
}

/** Real page zoom, the same route as Ctrl+Plus — not a CSS zoom hack. */
async function setZoom(a, factor) {
  await a.app.evaluate(async ({ BrowserWindow }, z) => {
    const win = BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed()).pop();
    win.webContents.setZoomFactor(z);
  }, factor);
  await a.win.waitForTimeout(700);
  return a.win.evaluate(() => ({ vw: window.innerWidth, vh: window.innerHeight, dpr: window.devicePixelRatio }));
}

/** Read the real window geometry out of the main process, not from assumptions. */
async function windowGeometry(a) {
  return a.app.evaluate(async ({ BrowserWindow }) => {
    const win = BrowserWindow.getAllWindows().filter((b) => !b.isDestroyed()).pop();
    return {
      minimumSize: win.getMinimumSize(),
      size: win.getSize(),
      contentSize: win.getContentSize(),
      zoomFactor: win.webContents.getZoomFactor(),
    };
  });
}

module.exports = { open, loadVideo, addSegments, setZoom, setSize, inject, dismissGate, gateUp, windowGeometry, URL_OK };
