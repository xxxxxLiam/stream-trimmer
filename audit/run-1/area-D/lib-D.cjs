/**
 * Shared helpers for area D's UI runs. Audit scaffolding only; changes no
 * product code and imports none.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB = `${SCRATCH}/stubD2`;

/** A synthetic Netscape cookies.txt, which is what the product actually parses. */
function cookiesTxt() {
  const far = Math.floor(Date.now() / 1000) + 365 * 24 * 3600;
  return [
    "# Netscape HTTP Cookie File",
    `.youtube.com\tTRUE\t/\tTRUE\t${far}\tSID\tauditSID0000000000`,
    `.youtube.com\tTRUE\t/\tTRUE\t${far}\t__Secure-3PSID\tauditSecure3PSID00`,
    `.google.com\tTRUE\t/\tTRUE\t${far}\tHSID\tauditHSID`,
    "",
  ].join("\n");
}

/** A campaign record in the shape src/lib/campaigns.ts stores. */
function campaign(id, name, clipsDir, dataDir) {
  return {
    id,
    name,
    targetMinSec: 5,
    targetMaxSec: 60,
    hardMaxSec: 120,
    clipIdPattern: "{prefix}-{videoId}-{nn}",
    prefix: "AUD",
    format: "mp4",
    quality: "best",
    clipsDir: clipsDir || "",
    dataDir: dataDir || "",
    usedRanges: {},
  };
}

/** Fresh clips/data folder pair under a throwaway root. */
function folders(label) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `D-${label}-`));
  const clips = path.join(root, "Clips");
  const data = path.join(root, "ChannelData");
  fs.mkdirSync(clips);
  fs.mkdirSync(data);
  return { root, clips, data };
}

/**
 * Launch, get past the YouTube gate by importing a synthetic cookies.txt
 * through the product's own import channel, and wait for the workspace.
 */
async function boot(opts) {
  const a = await launchApp({ cwd: STUB, ...opts });
  await a.win.waitForSelector("header", { timeout: 25000 });
  // Get past the YouTube gate the way a user does: drop a cookies.txt on the
  // window. This runs the product's own drop handler and import path.
  const drop = async () => {
    await a.win.evaluate(async (text) => {
      const dt = new DataTransfer();
      dt.items.add(new File([text], "cookies.txt", { type: "text/plain" }));
      window.dispatchEvent(new DragEvent("dragover", { dataTransfer: dt, bubbles: true, cancelable: true }));
      window.dispatchEvent(new DragEvent("drop", { dataTransfer: dt, bubbles: true, cancelable: true }));
    }, cookiesTxt());
  };
  const gated = async () =>
    await a.win.evaluate(() => !!document.querySelector('[aria-labelledby="youtube-connect-title"]'));

  for (let attempt = 0; attempt < 5; attempt++) {
    await a.win.waitForTimeout(1500);
    if (!(await gated())) break;
    await drop();
    for (let i = 0; i < 24; i++) {
      if (!(await gated())) break;
      await a.win.waitForTimeout(500);
    }
    if (!(await gated())) break;
  }
  if (await gated()) {
    const why = await a.win.evaluate(
      () => document.querySelector('[aria-labelledby="youtube-connect-title"]').innerText.slice(0, 500),
    );
    throw new Error("could not get past the YouTube sign-in gate:\n" + why);
  }
  return a;
}

/** Make pickDirectory answer with `dir` instead of opening a native dialog. */
async function stubPickDirectory(win, dir) {
  return await win.evaluate((d) => {
    const orig = window.electronAPI;
    const next = {};
    for (const k in orig) next[k] = typeof orig[k] === "function" ? orig[k].bind(orig) : orig[k];
    next.pickDirectory = async () => d;
    try {
      Object.defineProperty(window, "electronAPI", { value: next, configurable: true, writable: true });
      return window.electronAPI.pickDirectory === next.pickDirectory;
    } catch (e) {
      return "could not replace: " + String(e);
    }
  }, dir);
}

/** Paste a URL, mark a segment, add it, cut. Returns the status text seen. */
async function cutOneClip(a, { from = 2, to = 6 } = {}) {
  await a.win.fill('input[type="url"], input[placeholder*="ouTube" i], input[placeholder*="link" i]', "https://www.youtube.com/watch?v=stub0000001");
  await a.win.keyboard.press("Enter");
  await a.win.waitForTimeout(2500);
  await a.win.evaluate(
    ({ from, to }) => {
      const v = document.querySelector("video");
      if (v) v.currentTime = from;
    },
    { from, to },
  );
  return a;
}

module.exports = { launchApp, boot, campaign, folders, cookiesTxt, stubPickDirectory, cutOneClip, STUB, SCRATCH };
