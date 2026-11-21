#!/usr/bin/env node
/**
 * AF-06 — F-1: every help anchor, enumerated from the catalogue (never
 * transcribed) and probed against the LIVE DOM in the state its own step puts
 * the app in. Verifies T10's claim that the 6 remaining spotlight-less steps
 * are all legitimate.
 *
 * usage: node af-06-anchors.cjs [public|owner]
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { launch, writeStub, AUTH_TEXT, jar } = require("./lib.cjs");

const REPO = "/home/user/stream-trimmer";
const SHAPE = process.argv[2] === "owner" ? "owner" : "public";
const MIRROR = `/tmp/af-${SHAPE}`;
const CLIPS = "/tmp/af-clips-06";

/** Load the catalogue from source, transpiled — no transcription. */
function catalogue() {
  const tmp = fs.mkdtempSync("/tmp/af-cat-");
  const out = path.join(tmp, "helpTasks.cjs");
  execFileSync(path.join(REPO, "node_modules", ".bin", "esbuild"), [
    path.join(REPO, "src", "lib", "helpTasks.ts"),
    "--bundle", "--format=cjs", "--platform=node", `--outfile=${out}`,
  ]);
  return require(out);
}

/**
 * What the step's own PRECEDING steps tell the user to have done.
 * Keyed "<taskId>#<1-based step>".
 */
const PREP = {
  "find-by-words#1": ["transcript"],
  "find-by-words#2": ["transcript", "transcriptSearch"],
  "check-unused#1": ["transcript"],
  "check-unused#2": ["overlapRange"],
  "reorder-segments#1": ["segment"],
  "reorder-segments#2": ["segment"],
  "switch-campaign#2": ["campaignMenu"],
  "copy-transcript#1": ["transcript"],
  "copy-transcript#2": ["transcript", "copyBlocks"],
  "copy-script-lines#1": ["transcript", "segment"],
  "copy-script-lines#2": ["transcript", "segment", "copyBlocks"],
  "insert-symbol#2": ["symbols"],
  "recut-saved#1": ["allSaved"],
  "recut-saved#2": ["allSaved"],
  "recut-saved#3": ["allSaved"],
  "export-channel#1": ["workspaceScreen"],
  "export-channel#2": ["channelScreen"],
  "stop-run#1": ["channelScreen"],
  "stop-run#2": ["channelScreen"],
};

async function applyPrep(win, names, log) {
  for (const n of names) {
    try {
      switch (n) {
        case "transcript":
          // already loaded at boot; make sure the column rendered
          await win.waitForSelector("#ui-col-transcript", { timeout: 3000 });
          break;
        case "transcriptSearch":
          await win.keyboard.press("Control+f");
          break;
        case "segment":
          if ((await win.locator("#ui-segment-list li").count()) === 0) {
            await win.fill("#ui-mark-in", "00:00:02");
            await win.fill("#ui-mark-out", "00:00:06");
            await win.click("#ui-add-segment");
          }
          break;
        case "overlapRange":
          await win.fill("#ui-mark-in", "00:00:11");
          await win.fill("#ui-mark-out", "00:00:17");
          break;
        case "campaignMenu":
          if ((await win.locator("#ui-campaign-list").count()) === 0) {
            await win.click("#ui-campaign-chip");
          }
          break;
        case "copyBlocks":
          if ((await win.evaluate(() => !!document.querySelector('[id^="ui-copy-block-"]'))) === false) {
            await win.click("#ui-copy-blocks");
          }
          break;
        case "symbols":
          if ((await win.locator("#ui-symbol-list").count()) === 0) await win.click("#ui-symbols");
          break;
        case "allSaved":
          await win.click("#clips-tab-all");
          break;
        case "channelScreen":
          if ((await win.locator("#ui-channel-link").count()) > 0) await win.click("#ui-channel-link");
          break;
        case "workspaceScreen":
          if ((await win.locator("text=Back to clipping").count()) > 0) {
            await win.click("text=Back to clipping");
          }
          break;
      }
      log.push([n, true]);
    } catch (e) {
      log.push([n, String(e).split("\n")[0]]);
    }
  }
  await win.waitForTimeout(500);
}

async function resetOverlays(win) {
  await win.evaluate(() => {
    // close popovers by clicking the page background
    document.body.click();
  });
  for (const id of ["ui-copy-blocks", "ui-symbols"]) {
    const openNow = await win.evaluate((i) => {
      const b = document.getElementById(i);
      return b?.getAttribute("aria-pressed") === "true";
    }, id);
    if (openNow) await win.click(`#${id}`).catch(() => {});
  }
  await win.waitForTimeout(200);
}

async function main() {
  const cat = catalogue();
  const tasks = SHAPE === "owner" ? [...cat.HELP_TASKS, ...cat.CHANNEL_HELP_TASKS] : cat.HELP_TASKS;
  const R = {
    shape: SHAPE,
    declaredAnchors: Object.values(cat.ANCHORS),
    declaredCount: Object.keys(cat.ANCHORS).length,
    taskCount: tasks.length,
    stepCount: tasks.reduce((n, t) => n + t.steps.length, 0),
    nullSteps: [],
    steps: [],
  };
  for (const t of tasks) {
    t.steps.forEach((s, i) => {
      if (s.anchorId === null) R.nullSteps.push(`${t.id}#${i + 1}`);
    });
  }

  fs.rmSync(CLIPS, { recursive: true, force: true });
  fs.mkdirSync(CLIPS, { recursive: true });
  fs.writeFileSync(path.join(CLIPS, "AF-stub0000001-01.mp4"), "x");
  writeStub({
    auth: { ...AUTH_TEXT.profile_missing, perSource: { app: AUTH_TEXT.signed_in } },
    infoStage: {}, downloadStage: {}, subs: {},
  });

  const campaign = {
    id: "camp_af6", name: "Audit AF", targetMinSec: 1, targetMaxSec: 600, hardMaxSec: 900,
    clipIdPattern: "{prefix}-{videoId}-{nn}", prefix: "AF", format: "mp4", quality: "360",
    clipsDir: CLIPS, dataDir: "/tmp/af-data-06",
    // a used range so "check-unused" step 2 has something to overlap
    usedRanges: { stub0000001: [{ start: 10, end: 18, clipId: "AF-stub0000001-01" }] },
  };

  const a = await launch({
    label: `af-06-${SHAPE}`,
    mirror: MIRROR,
    cookieFile: jar(),
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.campaigns": [campaign, { ...campaign, id: "camp_af6b", name: "Second campaign" }],
      "clipper.activeCampaign": "camp_af6",
      "clipper.clipsDir": CLIPS,
      "clipper.saveDir": CLIPS,
      "clipper.saveDirs": [CLIPS],
      "clipper.workspaces": {
        tabs: [{ id: "ws1", name: "", url: "https://www.youtube.com/watch?v=stub0000001" }],
        activeId: "ws1",
      },
      "clipper.downloads": [
        {
          kind: "clip", label: "AF-stub0000001-01.mp4",
          path: path.join(CLIPS, "AF-stub0000001-01.mp4"), dir: CLIPS,
          detail: "Downloaded at 360p.", id: "seeded-1", savedAt: Date.now() - 60000,
          videoId: "stub0000001",
          segments: [{ start: 10, end: 18 }],
        },
      ],
    },
  });

  try {
    await a.win.waitForSelector("#ui-mark-in", { timeout: 30000 });
    await a.win.waitForTimeout(4000);
    // make sure the transcript really loaded
    R.transcriptLoaded = await a.win.evaluate(
      () => !!document.getElementById("ui-transcript-lines"),
    );
    if (!R.transcriptLoaded) {
      // the transcript column loads on demand
      await a.win.click("#ui-col-transcript").catch(() => {});
      await a.win.waitForTimeout(2500);
      R.transcriptLoaded = await a.win.evaluate(() => !!document.getElementById("ui-transcript-lines"));
    }
    R.shot_loaded = await a.shot("workspace-loaded");

    // open help
    await a.win.click("#ui-help-button");
    await a.win.waitForSelector("#ui-help-drawer", { timeout: 5000 });

    for (const t of tasks) {
      // get back to the list and select this task by title
      await resetOverlays(a.win);
      const allTasks = a.win.locator("#ui-help-drawer button", { hasText: "All tasks" });
      if (await allTasks.count()) await allTasks.first().click().catch(() => {});
      await a.win.fill("#help-search", t.title);
      await a.win.waitForTimeout(250);
      const first = a.win.locator("#ui-help-drawer [data-help-result]").first();
      if ((await first.count()) === 0) {
        R.steps.push({ task: t.id, step: 0, error: "task not in the drawer list" });
        continue;
      }
      await first.click();
      await a.win.waitForTimeout(250);

      for (let i = 0; i < t.steps.length; i++) {
        const s = t.steps[i];
        const prepLog = [];
        await applyPrep(a.win, PREP[`${t.id}#${i + 1}`] || [], prepLog);
        await a.win.waitForTimeout(350);
        const probe = await a.win.evaluate((anchorId) => {
          const el = anchorId ? document.getElementById(anchorId) : null;
          const r = el ? el.getBoundingClientRect() : null;
          const sp = document.querySelector("[data-help-spotlight]");
          const notice = Array.from(document.querySelectorAll("#ui-help-drawer [role=status]")).some(
            (p) => /not on screen right now/.test(p.textContent || ""),
          );
          const dupes = anchorId
            ? document.querySelectorAll(`[id="${anchorId}"]`).length
            : 0;
          return {
            found: !!el,
            dupes,
            rect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
            visible: !!(r && r.width > 0 && r.height > 0),
            spotlight: !!sp,
            spotlightFor: sp ? sp.getAttribute("data-help-spotlight") : null,
            notice,
          };
        }, s.anchorId);
        R.steps.push({
          task: t.id, step: i + 1, anchorId: s.anchorId, do: s.do, prep: prepLog, ...probe,
        });
        if (!probe.spotlight) {
          await a.shot(`dead-${t.id}-${i + 1}`);
        }
        // advance
        const next = a.win.locator("#ui-help-drawer button", { hasText: "Next step" });
        if (await next.count()) await next.first().click();
        await a.win.waitForTimeout(250);
      }
    }

    // Which declared anchors never existed in any state we reached?
    R.anchorsEverSeen = {};
    for (const id of R.declaredAnchors) {
      R.anchorsEverSeen[id] = R.steps.some((s) => s.anchorId === id && s.found);
    }
    R.unusedByAnyStep = R.declaredAnchors.filter(
      (id) => !R.steps.some((s) => s.anchorId === id),
    );
    R.stepsWithoutSpotlight = R.steps.filter((s) => !s.spotlight).map((s) => ({
      id: `${s.task}#${s.step}`, anchorId: s.anchorId, found: s.found, visible: s.visible, notice: s.notice,
    }));
    R.falseNotices = R.steps.filter((s) => s.notice && s.found && s.visible).map((s) => `${s.task}#${s.step}`);
    R.noticeOnNull = R.steps.filter((s) => s.anchorId === null && s.notice).map((s) => `${s.task}#${s.step}`);
  } finally {
    a.save(`af-06-${SHAPE}.json`, R);
    await a.close();
  }
  console.log(
    JSON.stringify(
      {
        shape: R.shape, declaredCount: R.declaredCount, taskCount: R.taskCount,
        stepCount: R.stepCount, transcriptLoaded: R.transcriptLoaded,
        nullSteps: R.nullSteps, unusedByAnyStep: R.unusedByAnyStep,
        stepsWithoutSpotlight: R.stepsWithoutSpotlight,
        falseNotices: R.falseNotices, noticeOnNull: R.noticeOnNull,
        dupes: R.steps.filter((s) => s.dupes > 1).map((s) => `${s.task}#${s.step}:${s.dupes}`),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => { console.error(e); process.exit(1); });
