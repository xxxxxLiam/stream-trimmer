/**
 * File: v-lib.cjs
 * Path: audit/run-1/verify/slice-1/v-lib.cjs
 * Description: Slice-1 verification helpers. Boots the real app through the
 *   official harness, gets past the YouTube gate using the PRODUCT'S OWN
 *   cookie-import IPC (no product code changed, no CSS injected, no overlay
 *   hidden), and offers small helpers for loading a video, marking and reading
 *   the mark bar.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launchApp, REPO } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const OUT_ROOT = path.join(__dirname, "out");

/** A synthetic Netscape cookies.txt that cookieState.cjs reads as signed in. */
function cookieText(daysValid = 90) {
  const exp = Math.floor(Date.now() / 1000) + daysValid * 86400;
  return [
    "# Netscape HTTP Cookie File",
    `.youtube.com\tTRUE\t/\tTRUE\t${exp}\tSID\tverify-sid-value`,
    `.youtube.com\tTRUE\t/\tTRUE\t${exp}\t__Secure-3PSID\tverify-3psid-value`,
    `.google.com\tTRUE\t/\tTRUE\t${exp}\tHSID\tverify-hsid`,
    "",
  ].join("\n");
}

/**
 * Cold start. Fresh user-data dir (launchApp), fresh stub root is the caller's
 * job. Returns the harness object plus `log`.
 */
async function boot({ label, stubRoot, seed = {}, viewport, signIn = true }) {
  const outDir = path.join(OUT_ROOT, label);
  fs.rmSync(outDir, { recursive: true, force: true });
  const a = await launchApp({ label, cwd: stubRoot, outDir, seed });
  const lines = [];
  a.log = (...parts) => {
    const s = parts
      .map((p) => (typeof p === "string" ? p : JSON.stringify(p)))
      .join(" ");
    lines.push(s);
    console.log(s);
  };
  a.lines = lines;
  a.writeLog = () => {
    fs.writeFileSync(path.join(outDir, "run.txt"), lines.join("\n") + "\n");
    return path.join(outDir, "run.txt");
  };

  if (viewport) await a.win.setViewportSize(viewport);
  await a.win.waitForSelector("body");

  if (signIn) {
    // The product's own drop-in-cookies path.
    const res = await a.win.evaluate(
      (text) => window.electronAPI.importYouTubeCookiesText(text),
      cookieText(),
    );
    a.log("cookie import said:", JSON.stringify(res));
    // The modal closes once the connection state flips.
    await a.win
      .waitForFunction(
        () => !document.querySelector("#youtube-connect-title"),
        null,
        { timeout: 30000 },
      )
      .catch(async () => {
        await a.shot("gate-still-up");
        throw new Error("YouTube gate never closed");
      });
  }
  return a;
}

/** Paste a URL into the active tab's URL bar and press Enter. */
async function loadUrl(a, url, { waitForChip = true } = {}) {
  const box = a.win.locator('input[type="url"]:visible').first();
  await box.click();
  await box.fill("");
  await box.fill(url);
  await box.press("Enter");
  if (waitForChip) {
    await a.win
      .waitForFunction(
        () => {
          const chips = [...document.querySelectorAll("#ui-source-chip")];
          return chips.some((c) => c.offsetParent !== null);
        },
        null,
        { timeout: 30000 },
      )
      .catch(() => {});
  }
}

/** The visible mark bar's state: segment rows, stitched total, source chip. */
function paneState() {
  const vis = (el) => el && el.offsetParent !== null;
  const txt = (el) => (el ? el.innerText.replace(/\s+/g, " ").trim() : null);
  const panes = [...document.querySelectorAll("#ui-stitched-total")];
  return panes.map((p, i) => {
    const root = p.closest(".absolute.inset-0") || document.body;
    const rows = [...root.querySelectorAll("li, [data-segment-row]")]
      .map((li) => txt(li))
      .filter((t) => t && /\d\d:\d\d:\d\d to \d\d:\d\d:\d\d/.test(t));
    return {
      i,
      visible: vis(p),
      total: txt(p),
      rows,
      source: txt(root.querySelector("#ui-source-chip")),
    };
  });
}

/** Is the renderer still alive and showing a UI? */
function alive() {
  const root = document.getElementById("root");
  return {
    rootChildren: root ? root.children.length : -1,
    bodyLen: document.body.innerText.length,
    header: Boolean(document.querySelector("header")),
    tabs: [...document.querySelectorAll('[role="tab"], [data-ws-tab]')].length,
  };
}

module.exports = { boot, loadUrl, paneState, alive, cookieText, OUT_ROOT, REPO };
