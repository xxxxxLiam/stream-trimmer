/**
 * Area D / state over time, order of actions, and the drag-out handle.
 *
 * - clipper.editorHandoff seeded from an older shape (including the removed
 *   "premiere" choice and wrong types)
 * - clipper.saveDirs seeded with a path that no longer exists
 * - Send with no clip at all
 * - no campaign selected: are the handoff fields live?
 * - the after-cutting Final Cut send failing: is the user told?
 * - the drag-out handle: is it there, and what does a real mouse drag do?
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, campaign, folders } = require("./lib-D.cjs");
const { loadVideo, addSegment, cut } = require("./lib-cut.cjs");

const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out/state";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const F = folders("state");
  const DEAD = "/tmp/a-folder-that-was-deleted-long-ago";

  // ---------------------------------------------------------------- PART 1
  console.log("================ PART 1: an older / corrupt editorHandoff shape ================");
  {
    const old = {
      // what a 3.x install might hold, plus deliberate wrong types
      aud: {
        afterCutting: "premiere",          // the removed choice
        eventName: "whatever",
        capcutDropDir: 12345,
        openCapCut: "yes",
        fcpLibrary: { path: "/nope" },
        mediaEvent: null,
        projectEvent: 7,
        createProject: "true",
        projectNamePattern: 99,
        timelineFormat: "1080x1920@30",
      },
      "a-campaign-that-no-longer-exists": { afterCutting: "finalcut" },
    };
    const a = await boot({
      label: "D-state-old", outDir: `${OUT}/old-shape`,
      seed: {
        "clipper.dataDirConfirmed": true,
        "clipper.clipsDir": F.clips, "clipper.dataDir": F.data, "clipper.saveDir": F.clips,
        "clipper.campaigns": [campaign("aud", "Audit D", F.clips, F.data)],
        "clipper.activeCampaign": "aud",
        "clipper.editorHandoff": old,
        "clipper.saveDirs": [DEAD, F.clips],
        "clipper.saveDirNames": { [DEAD]: "Old external drive" },
        "clipper.downloads": [
          { id: "old-1", kind: "clip", label: "GONE-01.mp4", path: `${DEAD}/GONE-01.mp4`, dir: DEAD, savedAt: 1 },
        ],
      },
    });
    try {
      console.log("summary row:", await a.win.evaluate(
        () => document.querySelector('section[aria-label="Editor handoff"] button[aria-expanded]')?.innerText.replace(/\n+/g, " | ")));
      await a.win.click('section[aria-label="Editor handoff"] button[aria-expanded]');
      await a.win.waitForTimeout(500);
      const vals = await a.win.evaluate(() => {
        const s = document.querySelector('section[aria-label="Editor handoff"]');
        return {
          selects: Array.from(s.querySelectorAll("select")).map((x) => x.value),
          inputs: Array.from(s.querySelectorAll("input")).map((x) => x.type === "checkbox" ? x.checked : x.value),
          alerts: Array.from(s.querySelectorAll('[role="alert"]')).map((x) => x.innerText.trim()),
        };
      });
      console.log("panel values after normalising:", JSON.stringify(vals, null, 1));
      console.log(await a.shot("old-shape-panel"));
      console.log("footer:", await a.win.evaluate(() => document.querySelector("footer")?.innerText.replace(/\n+/g, " | ")));
      console.log("'premiere' survives anywhere in the UI?", await a.win.evaluate(() => /premiere/i.test(document.body.innerText) ? document.body.innerText.match(/.{0,60}[Pp]remiere.{0,60}/g) : false));
      console.log("page errors:", JSON.stringify(a.logs.pageErrors));

      // Send with NO clips in this session
      console.log("\n--- Send with no clip in the session ---");
      console.log("Export FCPXML disabled:", await a.win.locator('button:text-is("Export FCPXML")').isDisabled());
      console.log("Send all disabled:", await a.win.locator('button:text-is("Send all to Final Cut Pro")').isDisabled());
      console.log("Copy file path disabled:", await a.win.locator('button:text-is("Copy file path")').isDisabled());
      console.log("title/why:", await a.win.locator('button:text-is("Send all to Final Cut Pro")').getAttribute("title"));
      console.log("files written into the clips folder:", fs.readdirSync(F.clips));

      // the dead saveDir / dead download row
      console.log("\n--- a download row whose file is gone ---");
      console.log(await a.shot("dead-download-row"));
      console.log("dead path still reported as existing?", await a.win.evaluate(
        async (p) => await window.electronAPI.fileExists(p), `${DEAD}/GONE-01.mp4`));
      const dragHandles = await a.win.locator('[aria-label*="Drag"]').count();
      console.log("drag-out handles on screen:", dragHandles);

      // what reveal of the clips folder actually returns
      console.log("\n--- editor:reveal on the clips folder, and on a dead path ---");
      console.log("clipsDir:", JSON.stringify(await a.win.evaluate(async (p) => await window.electronAPI.editor.reveal(p), F.clips)));
      console.log("dead:    ", JSON.stringify(await a.win.evaluate(async (p) => await window.electronAPI.editor.reveal(p), DEAD)));
    } finally { await a.close(); }
  }

  // ---------------------------------------------------------------- PART 2
  console.log("\n\n================ PART 2: no campaign selected ================");
  {
    const G = folders("nocampaign");
    const a = await boot({
      label: "D-state-nocamp", outDir: `${OUT}/no-campaign`,
      seed: { "clipper.dataDirConfirmed": true, "clipper.clipsDir": G.clips, "clipper.dataDir": G.data, "clipper.saveDir": G.clips },
    });
    try {
      await a.win.click('section[aria-label="Editor handoff"] button[aria-expanded]');
      await a.win.waitForTimeout(400);
      const lib = a.win.locator('section[aria-label="Editor handoff"] label:has(> span:text-is("Library")) input').first();
      await lib.fill("/tmp/Some Library.fcpbundle");
      await a.win.waitForTimeout(500);
      console.log("Library field value after typing:", JSON.stringify(await lib.inputValue()));
      await a.win.selectOption('section[aria-label="Editor handoff"] select >> nth=0', "finalcut");
      await a.win.waitForTimeout(400);
      console.log("After cutting select value after choosing finalcut:",
        await a.win.evaluate(() => document.querySelector('section[aria-label="Editor handoff"] select')?.value));
      console.log("summary row says:", await a.win.evaluate(
        () => document.querySelector('section[aria-label="Editor handoff"] button[aria-expanded]')?.innerText.replace(/\n+/g, " | ")));
      console.log("persisted editorHandoff:", JSON.stringify(a.readState()["clipper.editorHandoff"]));
      console.log(await a.shot("no-campaign-fields"));
      console.log("checkbox 'Also create a project':");
      await a.win.click('section[aria-label="Editor handoff"] input[type="checkbox"] >> nth=0');
      await a.win.waitForTimeout(400);
      console.log("  checked now:", await a.win.locator('section[aria-label="Editor handoff"] input[type="checkbox"]').first().isChecked());
      console.log("  'Event for the projects' field appeared:",
        await a.win.locator('section[aria-label="Editor handoff"] label:has(> span:text-is("Event for the projects"))').count());
    } finally { await a.close(); }
  }

  // ---------------------------------------------------------------- PART 3
  console.log("\n\n================ PART 3: after-cutting send fails — is the user told? ================");
  {
    const H = folders("silent");
    const a = await boot({
      label: "D-state-silent", outDir: `${OUT}/silent-failure`,
      seed: {
        "clipper.dataDirConfirmed": true,
        "clipper.clipsDir": H.clips, "clipper.dataDir": H.data, "clipper.saveDir": H.clips,
        "clipper.campaigns": [campaign("aud", "Audit D", H.clips, H.data)],
        "clipper.activeCampaign": "aud",
        // After cutting = send to Final Cut, aimed at a library that is not there.
        "clipper.editorHandoff": {
          aud: {
            afterCutting: "finalcut", eventName: "campaign", capcutDropDir: "", openCapCut: false,
            fcpLibrary: "/tmp/this-library-does-not-exist.fcpbundle",
            mediaEvent: "Raw", projectEvent: "Projects", createProject: true,
            projectNamePattern: "{clipId}", timelineFormat: { kind: "vertical", width: 1080, height: 1920, fps: "30" },
          },
        },
      },
    });
    try {
      await loadVideo(a);
      await addSegment(a, 2, 8);
      const r = await cut(a);
      console.log("cut:", JSON.stringify(r).slice(0, 300));
      await a.win.waitForTimeout(4000);
      console.log("files in the clips folder:", fs.readdirSync(H.clips));
      console.log("was a library created at the bad path?", fs.existsSync("/tmp/this-library-does-not-exist.fcpbundle"));
      console.log("EVERY status / alert anywhere on screen:");
      console.log(JSON.stringify(await a.win.evaluate(() =>
        Array.from(document.querySelectorAll('[role="alert"], [role="status"]'))
          .map((e) => e.innerText.trim()).filter(Boolean)), null, 1));
      console.log("does the word 'library' appear anywhere on screen?",
        await a.win.evaluate(() => /library/i.test(document.body.innerText)));
      console.log(await a.shot("silent-after-cutting-failure"));

      // the drag-out handle on the saved toast
      console.log("\n--- the drag-out handle ---");
      const h = a.win.locator('[aria-label*="Drag"]');
      console.log("handles:", await h.count());
      if (await h.count()) {
        console.log("aria-label:", await h.first().getAttribute("aria-label"));
        console.log("tabindex:", await h.first().getAttribute("tabindex"));
        console.log("draggable:", await h.first().getAttribute("draggable"));
        console.log("reachable by keyboard (tabindex -1 means no):",
          (await h.first().getAttribute("tabindex")) !== "-1");
        console.log(await a.shot("drag-handle"));
        // A real mouse drag. file:startDrag blocks the main process, so this is
        // raced against a deadline and the app is considered wedged if it hangs.
        const box = await h.first().boundingBox();
        const drag = (async () => {
          await a.win.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
          await a.win.mouse.down();
          await a.win.mouse.move(box.x + 160, box.y - 90, { steps: 12 });
          await a.win.mouse.up();
          return "drag gesture completed";
        })();
        console.log("real mouse drag:", await Promise.race([
          drag.catch((e) => "drag threw: " + String(e.message).slice(0, 140)),
          new Promise((r) => setTimeout(() => r("*** THE DRAG NEVER RETURNED after 15s: the main process is wedged ***"), 15000)),
        ]));
        console.log("IPC still answers after the drag:", await Promise.race([
          a.win.evaluate(async () => await window.electronAPI.fileExists("/etc/hostname")).then((v) => "yes " + v).catch((e) => "evaluate failed"),
          new Promise((r) => setTimeout(() => r("*** NO ANSWER after 10s ***"), 10000)),
        ]));
      }
    } finally {
      await Promise.race([a.close(), new Promise((r) => setTimeout(r, 8000))]);
    }
  }
  process.exit(0);
})().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
