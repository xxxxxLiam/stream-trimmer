/**
 * A-05: the setup checklist and its step gating, in the real help drawer.
 * Four states, each a cold start: fresh install, half-finished setup, an
 * older settings.json shape, and a campaign whose folder was cleared again.
 */
const fs = require("node:fs");
const path = require("node:path");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");
const L = require("./lib.cjs");

const CAMPAIGN = (over = {}) => ({
  id: "c1",
  name: "Acme Show",
  clipsDir: "",
  dataDir: "",
  targetMinSec: 30,
  targetMaxSec: 60,
  hardMaxSec: 90,
  clipIdPattern: "{prefix}-{videoId}-{nn}",
  prefix: "ACME",
  format: "mp4",
  usedRanges: {},
  ...over,
});

async function readChecklist(win) {
  return win.evaluate(() => {
    const rows = Array.from(document.querySelectorAll("[data-setup-item]")).map((li) => ({
      id: li.getAttribute("data-setup-item"),
      done: li.getAttribute("data-done"),
      blocked: li.getAttribute("data-blocked"),
      waiting: (li.innerText.match(/Waiting for: (.*)/) || [])[1] || null,
      action: li.querySelector("button")?.textContent.trim() ?? null,
      note: li.innerText.split("\n")[0],
    }));
    const progress =
      (document.body.innerText.match(/(\d+) of (\d+) done/) || []).slice(0, 1)[0] || null;
    return { rows, progress, firstLine: document.body.innerText.includes("Setup is optional") };
  });
}

async function openChecklist(a, { signIn = true } = {}) {
  await a.win.waitForSelector("header", { timeout: 20000 });
  if (signIn) {
    fs.writeFileSync(L.cookieFileOf(a), L.goodCookies(), { mode: 0o600 });
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 20000 });
  }
  await a.win.waitForTimeout(4000);
  const modal = await a.win.evaluate(() => !!document.querySelector('[role="dialog"]'));
  await a.win.click("#ui-help-button");
  await a.win.waitForTimeout(400);
  const toggle = await a.win.$("#help-setup-toggle");
  if (toggle && (await toggle.getAttribute("aria-expanded")) !== "true") await toggle.click();
  await a.win.waitForTimeout(800);
  return { modalBlocking: modal };
}

async function scenario(label, seed, extra) {
  console.log("\n==================== " + label + " ====================");
  const a = await launchApp({
    label: `A-05-${label}`,
    cwd: L.STUB,
    outDir: `${L.OUT}/A-05-${label}`,
    seed,
  });
  try {
    const { modalBlocking } = await openChecklist(a);
    console.log("connect modal was blocking before sign-in:", modalBlocking);
    const got = await readChecklist(a.win);
    console.log("progress:", got.progress, "| first line present:", got.firstLine);
    for (const r of got.rows) {
      console.log(
        `  ${String(r.id).padEnd(15)} done=${String(r.done).padEnd(5)} blocked=${String(r.blocked).padEnd(5)} waiting=${String(r.waiting ?? "-").padEnd(40)} action=${r.action ?? "-"}`,
      );
    }
    console.log("SHOT", await a.shot("checklist"));
    if (extra) await extra(a);
  } finally {
    await a.close();
  }
}

(async () => {
  L.stub({ app: { exitCode: 1, stderr: "[debug] Found YouTube account cookies" }, browser: { exitCode: 0 } });

  // 1. fresh install: nothing set at all
  await scenario("fresh", {});

  // 2. half-finished: campaign exists, folder set, band nonsense, pattern has
  //    no number token, data folder identical to the clips folder
  const halfDir = "/tmp/area-A-clips";
  fs.mkdirSync(halfDir, { recursive: true });
  await scenario("half-finished", {
    "clipper.campaigns": [
      CAMPAIGN({
        clipsDir: halfDir,
        dataDir: halfDir,
        targetMinSec: 90,
        targetMaxSec: 60,
        hardMaxSec: 30,
        clipIdPattern: "just-a-name",
      }),
    ],
    "clipper.activeCampaign": "c1",
    "clipper.dataDirConfirmed": false,
  });

  // 3. an older settings.json: pre-split saveDir, campaign rows missing the
  //    newer fields entirely
  await scenario("older-shape", {
    "clipper.saveDir": "/tmp/area-A-old-clips",
    "clipper.saveDirs": ["/tmp/area-A-old-clips"],
    "clipper.campaigns": [{ id: "old1", name: "Legacy" }],
    "clipper.activeCampaign": "old1",
  });

  // 4. going back mid-flow: a complete campaign, then the clips folder is
  //    cleared again between launches. Derived "done" must untick and the
  //    dependent step must re-block.
  const doneDir = "/tmp/area-A-clips-2";
  fs.mkdirSync(doneDir, { recursive: true });
  await scenario(
    "complete-then-cleared",
    {
      "clipper.campaigns": [CAMPAIGN({ clipsDir: doneDir, dataDir: "/tmp/area-A-data-2" })],
      "clipper.activeCampaign": "c1",
      "clipper.editorHandoff": { c1: { afterCutting: "reveal" } },
    },
    async (a) => {
      const file = path.join(a.userDataDir, "settings.json");
      const s = JSON.parse(fs.readFileSync(file, "utf8"));
      s["clipper.campaigns"] = [CAMPAIGN({ clipsDir: "", dataDir: "" })];
      fs.writeFileSync(file, JSON.stringify(s, null, 2));
      await a.win.reload();
      await openChecklist(a, { signIn: false });
      const after = await readChecklist(a.win);
      console.log("-- after the clips folder was cleared --");
      console.log("progress:", after.progress);
      for (const r of after.rows) {
        console.log(
          `  ${String(r.id).padEnd(15)} done=${String(r.done).padEnd(5)} blocked=${String(r.blocked).padEnd(5)} waiting=${r.waiting ?? "-"}`,
        );
      }
      console.log("SHOT", await a.shot("after-cleared"));
    },
  );
})();
