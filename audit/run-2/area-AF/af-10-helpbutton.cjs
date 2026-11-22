#!/usr/bin/env node
/**
 * AF-10 — F-3: is the portalled help button clickable in every overlay state,
 * at several widths? Plus the side effect T8 flagged (Tab order) and the
 * declared anchors no step uses.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, writeStub, jar, AUTH_TEXT } = require("./lib.cjs");

const R = { widths: {}, tab: {}, gate: {} };
const CLIPS = "/tmp/af-clips-10";

const CAMPAIGN = {
  id: "camp_af10", name: "Audit AF", targetMinSec: 1, targetMaxSec: 600, hardMaxSec: 900,
  clipIdPattern: "{prefix}-{videoId}-{nn}", prefix: "AF", format: "mp4", quality: "360",
  clipsDir: CLIPS, dataDir: "/tmp/af-data-10", usedRanges: {},
};

const geom = `(() => {
  const b = document.getElementById("ui-help-button");
  if (!b) return { present: false };
  const r = b.getBoundingClientRect();
  const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  const header = document.querySelector("header");
  const hr = header ? header.getBoundingClientRect() : null;
  return {
    present: true,
    fromRight: Math.round(window.innerWidth - r.right),
    fromTop: Math.round(r.top),
    headerHeight: hr ? Math.round(hr.height) : null,
    hit: el ? el.tagName + "#" + (el.id || "") + "." + String(el.className).slice(0, 36) : null,
    hitIsSelf: el === b || b.contains(el),
    zIndex: getComputedStyle(b).zIndex,
    parentIsBody: b.parentElement === document.body,
  };
})()`;

async function toggleDrawerByClick(win) {
  const before = await win.locator("#ui-help-drawer").count();
  let result;
  try {
    await win.click("#ui-help-button", { timeout: 2500 });
    await win.waitForTimeout(350);
    const after = await win.locator("#ui-help-drawer").count();
    result = after !== before ? "clicked (drawer toggled)" : "clicked, drawer did NOT toggle";
    // restore
    if (after !== before) {
      await win.click("#ui-help-button", { timeout: 2500 }).catch(() => {});
      await win.waitForTimeout(250);
    }
  } catch (e) {
    result = `BLOCKED: ${String(e).split("\n")[0]}`;
  }
  return result;
}

async function openOverlay(win, name) {
  switch (name) {
    case "none": return;
    case "copyBlocks": await win.click("#ui-copy-blocks"); break;
    case "symbols": await win.click("#ui-symbols"); break;
    case "settings": await win.click("#ui-settings"); break;
    case "campaignMenu": await win.click("#ui-campaign-chip"); break;
    case "helpDrawerOpen": await win.click("#ui-help-button"); break;
    case "copyBlocks+drawer":
      await win.click("#ui-copy-blocks"); await win.click("#ui-help-button"); break;
    case "symbols+drawer":
      await win.click("#ui-symbols"); await win.click("#ui-help-button"); break;
    case "updateError":
      await win.evaluate(() => {});
      break;
  }
  await win.waitForTimeout(400);
}

async function closeOverlay(win, name) {
  switch (name) {
    case "copyBlocks": await win.click("#ui-copy-blocks").catch(() => {}); break;
    case "symbols": await win.click("#ui-symbols").catch(() => {}); break;
    case "settings": await win.keyboard.press("Escape"); break;
    case "campaignMenu": await win.keyboard.press("Escape"); break;
    case "helpDrawerOpen": await win.click("#ui-help-button").catch(() => {}); break;
    case "copyBlocks+drawer":
      await win.click("#ui-help-button").catch(() => {});
      await win.click("#ui-copy-blocks").catch(() => {}); break;
    case "symbols+drawer":
      await win.click("#ui-help-button").catch(() => {});
      await win.click("#ui-symbols").catch(() => {}); break;
  }
  await win.waitForTimeout(300);
}

const STATES = ["none", "copyBlocks", "symbols", "settings", "campaignMenu", "helpDrawerOpen", "copyBlocks+drawer", "symbols+drawer"];
const WIDTHS = [1440, 1280, 1024, 900, 760];

async function main() {
  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  writeStub({
    auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
    subs: {}, infoStage: {}, downloadStage: {},
  });

  const a = await launch({
    label: "af-10",
    cookieFile: jar(),
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.campaigns": [CAMPAIGN],
      "clipper.activeCampaign": "camp_af10",
      "clipper.clipsDir": CLIPS, "clipper.saveDir": CLIPS, "clipper.saveDirs": [CLIPS],
      "clipper.workspaces": {
        tabs: [{ id: "ws1", name: "", url: "https://www.youtube.com/watch?v=stub0000001" }],
        activeId: "ws1",
      },
    },
  });
  try {
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(3500);

    for (const w of WIDTHS) {
      await a.win.setViewportSize({ width: w, height: 800 });
      await a.win.waitForTimeout(500);
      R.widths[w] = {};
      for (const s of STATES) {
        await openOverlay(a.win, s);
        const g = await a.win.evaluate(geom);
        const click = await toggleDrawerByClick(a.win);
        R.widths[w][s] = { ...g, click };
        await closeOverlay(a.win, s);
      }
      // update error: does the portal follow the header wrap, and is it still clickable?
      await a.app.evaluate(({ BrowserWindow }, msg) => {
        for (const win of BrowserWindow.getAllWindows()) {
          win.webContents.send("updater:status", { state: "error", message: msg, url: "https://example.invalid/releases" });
        }
      }, "ENOENT: no such file or directory, open '/opt/Clipper/resources/app-update.yml'");
      await a.win.waitForTimeout(900);
      const g = await a.win.evaluate(geom);
      const click = await toggleDrawerByClick(a.win);
      R.widths[w].updateError = { ...g, click };
      await a.shot(`help-button-${w}-update-error`);
      await a.app.evaluate(({ BrowserWindow }) => {
        for (const win of BrowserWindow.getAllWindows()) win.webContents.send("updater:status", { state: "idle" });
      });
      await a.win.waitForTimeout(500);
    }

    // --- Tab order ---------------------------------------------------------
    await a.win.setViewportSize({ width: 1440, height: 900 });
    await a.win.waitForTimeout(500);
    await a.win.evaluate(() => document.body.focus());
    await a.win.evaluate(() => (document.activeElement && document.activeElement.blur?.()));
    const order = [];
    for (let i = 0; i < 70; i++) {
      await a.win.keyboard.press("Tab");
      const d = await a.win.evaluate(() => {
        const el = document.activeElement;
        return el ? `${el.tagName}#${el.id || ""}:${(el.textContent || "").trim().slice(0, 24)}` : "none";
      });
      order.push(d);
      if (/#ui-help-button/.test(d)) break;
    }
    R.tab.order = order;
    R.tab.helpAtStop = order.findIndex((d) => /#ui-help-button/.test(d)) + 1 || null;
    R.tab.totalProbed = order.length;
    R.tab.focusablesInDocument = await a.win.evaluate(
      () =>
        document.querySelectorAll(
          'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),summary,[tabindex]:not([tabindex="-1"])',
        ).length,
    );

    // --- declared anchors that no step uses --------------------------------
    R.unusedAnchorsExist = await a.win.evaluate(() =>
      Object.fromEntries(
        ["ui-source-chip", "ui-footer-format", "ui-col-centre", "ui-mark-out", "ui-stitched-total", "clips-panel"].map(
          (id) => [id, !!document.getElementById(id)],
        ),
      ),
    );
  } finally {
    a.save("af-10.json", R);
    fs.writeFileSync(path.join(__dirname, "out", "af-10.json"), JSON.stringify(R, null, 2));
    await a.close();
  }

  const compact = {};
  for (const [w, states] of Object.entries(R.widths)) {
    compact[w] = Object.fromEntries(
      Object.entries(states).map(([s, v]) => [
        s,
        `${v.click} | right:${v.fromRight} top:${v.fromTop} hdr:${v.headerHeight} self:${v.hitIsSelf}`,
      ]),
    );
  }
  console.log(JSON.stringify({ widths: compact, tab: R.tab, unusedAnchorsExist: R.unusedAnchorsExist }, null, 2));
}

main().catch((e) => { console.error(e); process.exit(1); });
