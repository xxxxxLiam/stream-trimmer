/**
 * File: lib.cjs
 * Path: audit/run-1/area-C/lib.cjs
 * Description: Area C (clip bank / campaigns) shared helpers. Audit-only.
 */
const path = require("node:path");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const STUB = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/stubC";
const OUT = "/home/user/stream-trimmer/audit/out";

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

function clip(id, start, end, over = {}) {
  return { id, label: `${id} label`, segments: [{ start, end }], status: "banked", ...over };
}

async function boot(label, seed = {}, opts = {}) {
  // Parallel helpers rebuild electron/dist/server.cjs, so a launch can lose the race.
  for (let i = 0; i < 4; i++) {
    try {
      return await boot1(label, seed, opts);
    } catch (e) {
      if (i === 3) throw e;
      await new Promise((r) => setTimeout(r, 4000));
    }
  }
}

async function boot1(label, seed = {}, opts = {}) {
  const a = await launchApp({
    label,
    cwd: STUB,
    outDir: path.join(OUT, "area-C", label),
    seed: { "clipper.dataDirConfirmed": true, ...seed },
    ...opts,
  });
  await a.win.waitForSelector("header", { timeout: 30000 });
  // No YouTube session exists in this container, so App.tsx keeps the sign-in modal
  // open over everything (that modal is area A's business). Hide it in the live DOM
  // with a stylesheet so area C can reach the workspace. No product code is touched.
  await a.win.addStyleTag({
    content: '[aria-labelledby="youtube-connect-title"]{display:none !important}',
  });
  return a;
}

const VID = "stub0000001";
const URL1 = `https://www.youtube.com/watch?v=${VID}`;

/** Type a URL into the header bar and wait for the video to load. */
async function loadVideo(a, url = URL1) {
  const input = a.win.locator('#ui-source-chip input[type="url"]');
  await input.waitFor({ timeout: 20000 });
  await input.fill(url);
  await a.win.keyboard.press("Enter");
  await a.win.waitForFunction(() => !!document.querySelector("#ui-col-clips"), null, { timeout: 20000 });
  // the clips column leaves the "Paste a link" gate once videoId is set
  await a.win
    .waitForFunction(
      () => !document.body.innerText.includes("Paste a link to see this video's clips."),
      null,
      { timeout: 25000 },
    )
    .catch(() => {});
}

async function openBankTab(a) {
  await a.win.click("#clips-tab-bank");
}

/** Paste a block into the import box and confirm. Returns the summary text. */
async function importBlock(a, text, { confirm = true } = {}) {
  await a.win.click('#ui-col-clips button:has-text("Import timestamps")');
  const ta = a.win.locator('textarea[placeholder="Paste your timestamps here"]');
  await ta.waitFor({ timeout: 10000 });
  // set value directly: this is what a paste does, without 5k keystrokes
  await ta.evaluate((el, v) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value").set;
    setter.call(el, v);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }, text);
  if (!confirm) return null;
  const btn = a.win.locator('#ui-col-clips button:has-text("Import ")').first();
  await btn.waitFor({ timeout: 20000 });
  await btn.click();
  return (await a.win.locator('#ui-col-clips').innerText()).split("\n").find((l) => l.startsWith("Imported:")) ?? "";
}

function bankOf(a, campaignId, videoId = VID) {
  const s = a.readState();
  return (s["clipper.bank"] || {})[campaignId]?.[videoId] ?? [];
}

module.exports = { boot, campaign, clip, loadVideo, openBankTab, importBlock, bankOf, STUB, OUT, VID, URL1 };
