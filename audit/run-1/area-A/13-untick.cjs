/**
 * A-13: is checklist "done" really derived? Clear the active campaign's clips
 * folder through the app's own settings IPC (the same channel the campaign
 * editor writes on), reload, and see whether the tick and the dependent
 * step's gate follow.
 *
 * Note on method: settings live in an in-memory store in the main process, so
 * editing settings.json on disk under a running app is ignored. This writes
 * through `window.electronAPI.setSetting`, which is the real path.
 */
const fs = require("node:fs");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

const CAMPAIGN = (clipsDir) => ({
  id: "c1",
  name: "Acme Show",
  clipsDir,
  dataDir: "/tmp/area-A-data-3",
  targetMinSec: 30,
  targetMaxSec: 60,
  hardMaxSec: 90,
  clipIdPattern: "{prefix}-{videoId}-{nn}",
  prefix: "ACME",
  format: "mp4",
  usedRanges: {},
});

const read = (win) =>
  win.evaluate(() => ({
    progress: (document.body.innerText.match(/\d+ of \d+ done/) || [])[0] ?? null,
    rows: Array.from(document.querySelectorAll("[data-setup-item]")).map((li) => ({
      id: li.getAttribute("data-setup-item"),
      done: li.getAttribute("data-done"),
      blocked: li.getAttribute("data-blocked"),
      waiting: (li.innerText.match(/Waiting for: (.*)/) || [])[1] || null,
    })),
  }));

async function openChecklist(win) {
  await win.waitForSelector("header", { timeout: 20000 });
  await win.waitForTimeout(4000);
  await win.click("#ui-help-button");
  await win.waitForTimeout(400);
  const t = await win.$("#help-setup-toggle");
  if (t && (await t.getAttribute("aria-expanded")) !== "true") await t.click();
  await win.waitForTimeout(900);
}

(async () => {
  L.stub({ app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies" }, browser: { exitCode: 0 } });
  fs.mkdirSync("/tmp/area-A-clips-3", { recursive: true });
  const a = await launchApp({
    label: "A-13-untick",
    cwd: L.STUB,
    outDir: `${L.OUT}/A-13`,
    seed: {
      "clipper.campaigns": [CAMPAIGN("/tmp/area-A-clips-3")],
      "clipper.activeCampaign": "c1",
      "clipper.editorHandoff": { c1: { afterCutting: "reveal" } },
    },
  });
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    fs.writeFileSync(L.cookieFileOf(a), L.goodCookies(), { mode: 0o600 });
    await a.win.reload();
    await openChecklist(a.win);
    console.log("WITH a clips folder:", JSON.stringify(await read(a.win), null, 1));

    await a.win.evaluate(
      (c) => window.electronAPI.setSetting("clipper.campaigns", [c]),
      CAMPAIGN(""),
    );
    await a.win.waitForTimeout(600);
    await a.win.reload();
    await openChecklist(a.win);
    console.log("AFTER the clips folder was cleared:", JSON.stringify(await read(a.win), null, 1));
    console.log("SHOT", await a.shot("after-clearing-clips-folder"));
    console.log(
      "campaigns actually persisted:",
      JSON.stringify(a.readState()["clipper.campaigns"]?.[0]?.clipsDir ?? "(none)"),
    );
  } finally {
    await a.close();
  }
})();
