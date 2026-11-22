#!/usr/bin/env node
/**
 * F-1 verification, from the finding's Steps, but harder on the point that
 * matters: "an anchor behind a panel the tutorial itself opens is not
 * missing." So for every step I first put the app into the state that step's
 * own PRECEDING steps describe (open Copy blocks, open Symbols, open the
 * campaign menu, open the All saved tab, mark a range, add a segment, open the
 * transcript search, open the chip menu) and only then probe the anchor.
 *
 * The catalogue is enumerated programmatically from src/lib/helpTasks.ts
 * (transpiled with esbuild, never hand-copied), so the counts are the real
 * ones for every task and step, not a transcription.
 *
 * Two passes:
 *   pass "empty"  — nothing loaded
 *   pass "loaded" — a video loaded, transcript rendered, a segment added, a
 *                   saved clip in the bank, plus the per-step preparation
 *
 * usage: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-f1.cjs [run]
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const esbuild = require("/home/user/stream-trimmer/node_modules/esbuild");
const { launch, api, cookieTxt, SIGNED_IN_STDERR } = require("./lib.cjs");
const { makeStub } = require("./mkstub.cjs");

const RUN = process.argv[2] || "1";
const STUB = `/tmp/s4-stub-f1-${RUN}`;
const REPO = "/home/user/stream-trimmer";

/* -------- enumerate the catalogue from source, not by hand -------- */
function loadCatalogue() {
  const src = fs.readFileSync(path.join(REPO, "src", "lib", "helpTasks.ts"), "utf8");
  const out = esbuild.transformSync(src, { loader: "ts", format: "cjs" }).code;
  const tmp = path.join(os.tmpdir(), `s4-helptasks-${process.pid}.cjs`);
  fs.writeFileSync(tmp, out);
  const mod = require(tmp);
  fs.unlinkSync(tmp);
  return mod;
}

const { ANCHORS, HELP_TASKS, CHANNEL_HELP_TASKS } = loadCatalogue();

/**
 * What a user following the tutorial would already have done by the time this
 * step is current. Derived from the step text in the catalogue itself.
 * Each entry is a list of actions run before probing that step.
 */
const PREP = {
  // task id -> per-step-index list of actions
  "cut-clip": [["clickTranscriptLine"], ["clickTranscriptLine", "mark"], ["clickTranscriptLine", "mark"]],
  "stitch-two-moments": [["mark"], ["mark", "addSegment"], ["mark", "addSegment"]],
  "find-by-words": [["transcriptSearch"], ["transcriptSearch"]],
  "nudge-edge": [["mark"], ["mark", "clickEdge"]],
  "check-unused": [[], []],
  "reorder-segments": [["mark", "addSegment"], ["mark", "addSegment"]],
  "switch-campaign": [[], ["openCampaignMenu"]],
  "change-clips-folder": [[], []],
  "change-data-folder": [[], []],
  "copy-transcript": [[], ["openCopyBlocks"]],
  "copy-script-lines": [["mark", "addSegment"], ["mark", "addSegment", "openCopyBlocks"]],
  "insert-symbol": [[], ["openSymbols"]],
  "fix-360p": [[], [], ["openChipMenu"]],
  "recut-saved": [["openSavedTab"], ["openSavedTab"], ["openSavedTab"]],
  "export-channel": [[], []],
  "stop-run": [[], []],
};

async function act(win, action) {
  const click = async (sel) => {
    try {
      await win.click(sel, { timeout: 2500 });
      return true;
    } catch {
      return false;
    }
  };
  switch (action) {
    case "clickTranscriptLine":
      return win
        .evaluate(() => {
          const col = document.getElementById("ui-col-transcript");
          const btn = col?.querySelector("button[data-cue], li button, button");
          btn?.click();
          return Boolean(btn);
        })
        .catch(() => false);
    case "mark":
      await click("#ui-mark-in");
      await win.waitForTimeout(150);
      await click("#ui-mark-out");
      return true;
    case "addSegment":
      return click("#ui-add-segment");
    case "clickEdge":
      return true;
    case "transcriptSearch":
      await win.keyboard.press("Control+f");
      await win.waitForTimeout(250);
      return true;
    case "openCampaignMenu":
      return click("#ui-campaign-chip");
    case "openCopyBlocks":
      return click("#ui-copy-blocks");
    case "openSymbols":
      return click("#ui-symbols");
    case "openChipMenu":
      return click('header button[aria-haspopup="menu"]');
    case "openSavedTab":
      return click("#clips-tab-all");
    default:
      return false;
  }
}

/** Close whatever a preparation opened, so the next step starts clean. */
async function resetState(win) {
  await win.evaluate(() => {
    // Close popovers the way the user would: Escape is handled per overlay,
    // but the help drawer also listens for Escape, so click the toggles.
    const ids = ["ui-copy-blocks", "ui-symbols", "ui-campaign-chip"];
    for (const id of ids) {
      const b = document.getElementById(id);
      if (b && b.getAttribute("aria-pressed") === "true") b.click();
      if (b && b.getAttribute("aria-expanded") === "true") b.click();
    }
    const chip = document.querySelector('header button[aria-haspopup="menu"]');
    if (chip && chip.getAttribute("aria-expanded") === "true") chip.click();
  });
  await win.waitForTimeout(200);
}

const probeAnchor = (win, id) =>
  win.evaluate((anchorId) => {
    const all = Array.from(document.querySelectorAll(`[id="${anchorId}"]`));
    const el = document.getElementById(anchorId);
    const r = el ? el.getBoundingClientRect() : null;
    const sp = document.querySelector("[data-help-spotlight]");
    const drawer = document.getElementById("ui-help-drawer");
    return {
      copies: all.length,
      exists: Boolean(el),
      rect: r ? { w: Math.round(r.width), h: Math.round(r.height) } : null,
      measurable: Boolean(r && r.width > 0 && r.height > 0),
      spotlight: Boolean(sp),
      spotlightAnchor: sp ? sp.getAttribute("data-help-spotlight") : null,
      notice: /That control is not on screen right now/.test(drawer?.textContent || ""),
      stepLabel: (drawer?.textContent || "").match(/Step \d+ of \d+/)?.[0] ?? null,
    };
  }, id);

async function walkTask(win, task, shot) {
  const rows = [];
  for (let i = 0; i < task.steps.length; i++) {
    await resetState(win);
    // Open the drawer, pick the task, advance to step i.
    await win.evaluate(() => {
      const d = document.getElementById("ui-help-drawer");
      if (!d) document.getElementById("ui-help-button")?.click();
    });
    await win.waitForSelector("#ui-help-drawer", { timeout: 10000 });
    // Back to the list, then pick by title.
    await win.evaluate(() => {
      const all = document.querySelectorAll("#ui-help-drawer button");
      for (const b of all) if ((b.textContent || "").trim() === "All tasks") b.click();
    });
    await win.waitForTimeout(150);
    const picked = await win.evaluate((title) => {
      const bs = Array.from(document.querySelectorAll("#ui-help-drawer [data-help-result]"));
      const b = bs.find((x) => (x.textContent || "").includes(title));
      if (b) b.click();
      return Boolean(b);
    }, task.title);
    if (!picked) {
      rows.push({ task: task.id, step: i + 1, anchorId: task.steps[i].anchorId, pickFailed: true });
      continue;
    }
    for (let k = 0; k < i; k++) {
      await win.evaluate(() => {
        const bs = Array.from(document.querySelectorAll("#ui-help-drawer button"));
        bs.find((b) => (b.textContent || "").trim() === "Next step")?.click();
      });
      await win.waitForTimeout(120);
    }
    // Now do what the tutorial told the user to do up to this point.
    const prep = (PREP[task.id] || [])[i] || [];
    const done = [];
    for (const action of prep) done.push([action, await act(win, action)]);
    await win.waitForTimeout(500);
    const p = await probeAnchor(win, task.steps[i].anchorId);
    rows.push({
      task: task.id,
      title: task.title,
      step: i + 1,
      anchorId: task.steps[i].anchorId,
      prep: done,
      ...p,
    });
    if (shot && !p.measurable) await shot(`${task.id}-step${i + 1}-absent`);
  }
  return rows;
}

(async () => {
  makeStub(STUB, {
    auth: { default: { exitCode: 0, stdout: SIGNED_IN_STDERR }, app: { exitCode: 0, stdout: SIGNED_IN_STDERR } },
    channel: { captionLines: 24, captionText: "spoken words in the transcript" },
  });

  const report = { run: RUN, anchorsDeclared: ANCHORS, passes: {} };
  report.catalogue = {
    publicTasks: HELP_TASKS.length,
    publicSteps: HELP_TASKS.reduce((n, t) => n + t.steps.length, 0),
    channelTasks: CHANNEL_HELP_TASKS.length,
    channelSteps: CHANNEL_HELP_TASKS.reduce((n, t) => n + t.steps.length, 0),
    distinctAnchorsUsedByPublicSteps: [
      ...new Set(HELP_TASKS.flatMap((t) => t.steps.map((s) => s.anchorId))),
    ],
    anchorsDeclaredCount: Object.keys(ANCHORS).length,
  };

  for (const pass of ["empty", "loaded"]) {
    const a = await launch({
      mirror: "/tmp/s4-public",
      label: `f1-${RUN}-${pass}`,
      cwd: STUB,
      cookieFile: cookieTxt(),
      seed: {
        "clipper.dataDirConfirmed": true,
        "clipper.authSource": "app",
        "clipper.clipsDir": "/tmp/s4-f1-clips",
        "clipper.dataDir": "/tmp/s4-f1-data",
        "clipper.campaigns": [
          {
            id: "camp1",
            name: "Campaign One",
            clipsDir: "/tmp/s4-f1-clips",
            dataDir: "/tmp/s4-f1-data",
          },
          { id: "camp2", name: "Campaign Two" },
        ],
        "clipper.activeCampaign": "camp1",
        // A saved clip, so "recut-saved" has a row to point at.
        "clipper.bank": [
          {
            id: "b1",
            videoId: "stub0000001",
            title: "Stub video",
            start: 10,
            end: 20,
            campaignId: "camp1",
            savedAt: Date.now(),
            file: "/tmp/s4-f1-clips/clip-1.mp4",
          },
        ],
        "clipper.downloads": [
          {
            id: "d1",
            name: "clip-1.mp4",
            path: "/tmp/s4-f1-clips/clip-1.mp4",
            at: Date.now(),
            videoId: "stub0000001",
          },
        ],
      },
    });
    const r = { pass };
    try {
      fs.mkdirSync("/tmp/s4-f1-clips", { recursive: true });
      fs.mkdirSync("/tmp/s4-f1-data", { recursive: true });
      await a.win.waitForSelector("header", { timeout: 30000 });
      await a.win.waitForTimeout(3000);
      r.modalOpen = await a.win.locator('[role="dialog"]').count();

      if (pass === "loaded") {
        await a.win.fill("header input", "https://www.youtube.com/watch?v=stub0000001");
        await a.win.keyboard.press("Enter");
        await a.win
          .waitForFunction(
            () => /spoken words in the transcript/.test(document.body.textContent || ""),
            { timeout: 60000 },
          )
          .catch(() => {});
        await a.win.waitForTimeout(1500);
        r.transcriptRendered = await a.win.evaluate(() =>
          /spoken words in the transcript/.test(document.body.textContent || ""),
        );
        r.videoLoaded = await a.win.evaluate(() => /Stub video/.test(document.body.textContent || ""));
        r.shotLoaded = await a.shot("00-loaded");
      }

      // ---- every id in the live DOM, state by state ----
      const dumpIds = () =>
        a.win.evaluate(() => Array.from(document.querySelectorAll("[id]")).map((e) => e.id));
      const states = {};
      states.base = await dumpIds();
      for (const [name, action] of [
        ["copyBlocksOpen", "openCopyBlocks"],
        ["symbolsOpen", "openSymbols"],
        ["campaignMenuOpen", "openCampaignMenu"],
        ["chipMenuOpen", "openChipMenu"],
        ["savedTab", "openSavedTab"],
        ["transcriptSearch", "transcriptSearch"],
        ["marked", "mark"],
        ["segmentAdded", "addSegment"],
      ]) {
        await resetState(a.win);
        await act(a.win, action);
        await a.win.waitForTimeout(400);
        states[name] = await dumpIds();
      }
      await resetState(a.win);
      // help drawer + setup checklist open
      await a.win.evaluate(() => document.getElementById("ui-help-button")?.click());
      await a.win.waitForTimeout(300);
      await a.win.evaluate(() => document.getElementById("help-setup-toggle")?.click());
      await a.win.waitForTimeout(400);
      states.helpAndChecklist = await dumpIds();

      const everSeen = new Set(Object.values(states).flat());
      r.idsSeenInAnyState = [...everSeen].sort();
      r.anchorStatus = {};
      for (const [key, id] of Object.entries(ANCHORS)) {
        r.anchorStatus[id] = { key, presentInSomeState: everSeen.has(id) };
      }
      r.anchorsMissingEverywhere = Object.entries(r.anchorStatus)
        .filter(([, v]) => !v.presentInSomeState)
        .map(([id]) => id);
      r.anchorsPresent = Object.entries(r.anchorStatus)
        .filter(([, v]) => v.presentInSomeState)
        .map(([id]) => id);

      // ---- walk every step with its own preparation ----
      r.steps = [];
      for (const task of HELP_TASKS) {
        r.steps.push(...(await walkTask(a.win, task, a.shot)));
      }
      r.stepsTotal = r.steps.length;
      r.stepsWithSpotlight = r.steps.filter((s) => s.spotlight).length;
      r.stepsNoAnchor = r.steps.filter((s) => !s.exists).length;
      r.stepsAnchorExistsButUnmeasurable = r.steps.filter((s) => s.exists && !s.measurable).length;
      r.stepsShowingNotice = r.steps.filter((s) => s.notice).length;
      r.deadTasks = HELP_TASKS.filter((t) =>
        r.steps.filter((s) => s.task === t.id).every((s) => !s.spotlight),
      ).map((t) => t.id);
      r.liveSteps = r.steps.filter((s) => s.spotlight).map((s) => `${s.task}#${s.step}:${s.anchorId}`);
    } catch (e) {
      r.error = String(e);
    }
    await a.close();
    report.passes[pass] = r;
  }

  /* Source-level cross-check: is any ANCHORS id ever assigned to an element
   * anywhere in src/ (literal or template)? */
  const srcFiles = [];
  (function walk(dir) {
    for (const f of fs.readdirSync(dir)) {
      const p = path.join(dir, f);
      const st = fs.statSync(p);
      if (st.isDirectory()) walk(p);
      else if (/\.(tsx|ts)$/.test(f)) srcFiles.push(p);
    }
  })(path.join(REPO, "src"));
  report.sourceAssignments = {};
  for (const id of Object.values(ANCHORS)) {
    const hits = [];
    for (const p of srcFiles) {
      const txt = fs.readFileSync(p, "utf8");
      const re = new RegExp(`id=(\\{)?["'\`]${id}["'\`]`, "g");
      if (re.test(txt)) hits.push(path.relative(REPO, p));
    }
    report.sourceAssignments[id] = hits;
  }
  report.idsNeverAssignedInSource = Object.entries(report.sourceAssignments)
    .filter(([, v]) => v.length === 0)
    .map(([k]) => k);

  const outFile = path.join(__dirname, "out", `f1-run${RUN}.json`);
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));

  const sum = (p) => {
    const r = report.passes[p];
    return {
      pass: p,
      stepsTotal: r.stepsTotal,
      stepsWithSpotlight: r.stepsWithSpotlight,
      stepsNoAnchor: r.stepsNoAnchor,
      stepsShowingNotice: r.stepsShowingNotice,
      anchorsMissingEverywhere: r.anchorsMissingEverywhere?.length,
      deadTasks: r.deadTasks,
      error: r.error,
    };
  };
  console.log(JSON.stringify({ catalogue: report.catalogue, empty: sum("empty"), loaded: sum("loaded") }, null, 2));
  console.log("anchors missing in every state (loaded pass):");
  console.log(JSON.stringify(report.passes.loaded.anchorsMissingEverywhere, null, 1));
  console.log("anchors present (loaded pass):", JSON.stringify(report.passes.loaded.anchorsPresent));
  console.log("live steps (loaded pass):", JSON.stringify(report.passes.loaded.liveSteps, null, 1));
  console.log("ids never assigned anywhere in src/:", report.idsNeverAssignedInSource.length);
  console.log("\nwrote", outFile);
})().catch((e) => { console.error(e); process.exit(1); });
