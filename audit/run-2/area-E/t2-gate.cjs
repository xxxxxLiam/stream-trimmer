#!/usr/bin/env node
/**
 * t2-gate.cjs — E-4: the gate's server side, and attacks on it.
 *
 * For one shape:
 *   1. Is the UI hidden?
 *   2. Do the three routes answer exactly like a route that does not exist?
 *      (status, content-type, body, and whether a stack trace or the words
 *      401/403/forbidden/unauthorized appear anywhere.)
 *   3. Forge every plausible owner key in localStorage AND in the settings
 *      store, reload, look again.
 *   4. Call window.electronAPI.isOwnerMachine with a doctored list — the
 *      build's own list, a wrong hash, ["*"], a caller-chosen salt — and then
 *      re-probe the routes.
 *   5. Drive `export:save` over IPC from this build: plant a file in a
 *      /tmp/ytchan-* folder (which is exactly the shape the exporter produces
 *      and exportSave.cjs insists on) and ask the main process to move it,
 *      BEFORE and AFTER the doctored owner:check above.
 *   6. Try to overwrite the bridge function, as run 1 did.
 *
 * usage: xvfb-run -a ... node t2-gate.cjs <shape>
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");
const { SALT, MINE_HASH, OTHER_HASH, hashFor } = require("./mirror.cjs");

const SHAPE = process.argv[2] || "owner-other";
const ROUTES = [
  ["POST", "/api/channel/export", { url: "https://www.youtube.com/@stubchannel", limit: 10, deliver: "path" }],
  ["POST", "/api/channel/export/cancel", { jobId: "t2-job" }],
  ["GET", "/api/channel/export/progress?jobId=t2-job", undefined],
];
const CONTROLS = [
  ["POST", "/api/channel/does-not-exist", { x: 1 }],
  ["GET", "/api/channel/nope?jobId=t2-job", undefined],
];

function classify(r) {
  const t = String(r.text || "");
  return {
    status: r.status,
    contentType: r.contentType,
    bytes: t.length,
    mentionsAuth: /401|403|forbidden|unauthori[sz]ed|owner|not allowed|denied/i.test(t),
    hasStack: /\bat \w|\.cjs:\d+|\.ts:\d+|Error:/.test(t),
    firstLine: t.split("\n")[0].slice(0, 120),
    json: r.json,
  };
}

async function probeRoutes(a) {
  const out = {};
  for (const [m, p, b] of ROUTES) out[`${m} ${p}`] = classify(await a.api(m, p, b));
  for (const [m, p, b] of CONTROLS) out[`CONTROL ${m} ${p}`] = classify(await a.api(m, p, b));
  out["CONTROL GET /api/cache/usage"] = classify(await a.api("GET", "/api/cache/usage"));
  return out;
}

const FORGE_KEYS = [
  "clipper.owner",
  "clipper.ownerMachine",
  "clipper.channelData",
  "clipper.isOwner",
  "clipper.ownerAccess",
  "clipper.screen",
  "owner",
  "ownerAccess",
  "isOwner",
  "CHANNEL_DATA",
  "__CHANNEL_DATA__",
  "VITE_ENABLE_CHANNEL_DATA",
  "VITE_OWNER_MACHINES",
  "clipper.VITE_OWNER_MACHINES",
];

(async () => {
  const report = { shape: SHAPE, salt: SALT, mine: MINE_HASH, other: OTHER_HASH, startedAt: new Date().toISOString() };
  const root = stubRoot(`t2-${SHAPE}`);
  setStub(root, { videos: 3, commentTexts: ["x"] });
  const dataDir = fs.mkdtempSync("/tmp/r2e-data-t2-");
  const stealDir = fs.mkdtempSync("/tmp/r2e-steal-t2-");

  const a = await launch({
    shape: SHAPE,
    label: `t2-${SHAPE}`,
    cwd: root,
    seed: {
      "clipper.dataDir": dataDir,
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": stealDir,
      "clipper.saveDir": stealDir,
    },
  });
  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    await sleep(1500);
    report.apiBase = await a.apiBase();

    report.beforeAttack = await a.win.evaluate(() => ({
      navHasChannelLink: Boolean(document.getElementById("ui-channel-link")),
      bodyMentionsChannelData: document.body.innerText.includes("Channel data"),
      exportPanel: Boolean(document.getElementById("ui-channel-start")),
    }));
    await a.shot("01-before-attack");

    report.routesBefore = await probeRoutes(a);

    // --- attack 1: forge every plausible owner key, both stores, then reload.
    report.attack1 = await a.win.evaluate(async (keys) => {
      const wrote = [];
      for (const k of keys) {
        try {
          localStorage.setItem(k, "true");
          wrote.push(k);
        } catch {
          /* ignore */
        }
        try {
          await window.electronAPI?.setSetting?.(k, true);
        } catch {
          /* ignore */
        }
      }
      return { wrote };
    }, FORGE_KEYS);
    report.attack1.settingsWrite = await a.win.evaluate(async (keys) => {
      const res = {};
      for (const k of keys) {
        try {
          res[k] = await window.electronAPI?.setSetting?.(k, true);
        } catch (e) {
          res[k] = String(e);
        }
      }
      return res;
    }, FORGE_KEYS.slice(0, 4));
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 30000 });
    await sleep(1200);
    report.attack1.after = await a.win.evaluate(() => ({
      navHasChannelLink: Boolean(document.getElementById("ui-channel-link")),
      bodyMentionsChannelData: document.body.innerText.includes("Channel data"),
      exportPanel: Boolean(document.getElementById("ui-channel-start")),
    }));
    report.attack1.settingsOnDisk = Object.fromEntries(
      Object.entries(a.readState()).filter(([k]) => /owner|channel|screen/i.test(k)),
    );
    await a.shot("02-after-forged-keys");

    // --- attack 5a: export:save BEFORE any doctored owner:check.
    const plant = (tag) => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ytchan-"));
      fs.writeFileSync(path.join(dir, "videos.csv"), "﻿\"video_id\"\r\n\"planted\"\r\n");
      return { dir, files: [{ name: `${tag}-videos.csv`, path: path.join(dir, "videos.csv") }] };
    };
    const p1 = plant("before");
    report.exportSaveBefore = await a.win.evaluate(
      async ([dirPath, files]) => {
        try {
          return await window.electronAPI.saveExport({ dirPath, folder: "t2-before", files });
        } catch (e) {
          return { threw: String(e) };
        }
      },
      [stealDir, p1.files],
    );
    report.exportSaveBefore.onDisk = fs.existsSync(path.join(stealDir, "t2-before"))
      ? fs.readdirSync(path.join(stealDir, "t2-before"))
      : null;

    // --- attack 4: doctored owner:check calls from the page.
    report.attack4 = await a.win.evaluate(
      async ([mine, other, salt]) => {
        const ask = (l, s) =>
          window.electronAPI
            .isOwnerMachine(l, s)
            .then((v) => v)
            .catch((e) => `threw ${e}`);
        return {
          buildsOwnList: await ask([other], salt),
          mineUnderRealSalt: await ask([mine], salt),
          star: await ask(["*"], salt),
          starNoSalt: await ask(["*"], ""),
          starMixedCase: await ask([" * "], "whatever"),
          emptyList: await ask([], salt),
          nonArray: await ask("*", salt),
          callerChosenSalt: await ask(["deadbeef"], "probe-salt"),
        };
      },
      [MINE_HASH, OTHER_HASH, SALT],
    );

    // Does the UI now reveal itself (the renderer caches its own verdict)?
    report.attack4.uiAfter = await a.win.evaluate(() => ({
      navHasChannelLink: Boolean(document.getElementById("ui-channel-link")),
      exportPanel: Boolean(document.getElementById("ui-channel-start")),
    }));
    report.routesAfterStar = await probeRoutes(a);

    // --- attack 5b: export:save AFTER the doctored ["*"] check.
    const p2 = plant("after");
    report.exportSaveAfterStar = await a.win.evaluate(
      async ([dirPath, files]) => {
        try {
          return await window.electronAPI.saveExport({ dirPath, folder: "t2-after-star", files });
        } catch (e) {
          return { threw: String(e) };
        }
      },
      [stealDir, p2.files],
    );
    report.exportSaveAfterStar.onDisk = fs.existsSync(path.join(stealDir, "t2-after-star"))
      ? fs.readdirSync(path.join(stealDir, "t2-after-star"))
      : null;

    // Does a live checkpoint folder (ytchanwip-) also pass exportSave's prefix test?
    const wip = fs.mkdtempSync(path.join(os.tmpdir(), "ytchanwip-"));
    fs.writeFileSync(path.join(wip, "comments.jsonl"), '{"a":1}\n');
    report.exportSaveWipPrefix = await a.win.evaluate(
      async ([dirPath, file]) => {
        try {
          return await window.electronAPI.saveExport({
            dirPath,
            folder: "t2-wip",
            files: [{ name: "stolen.jsonl", path: file }],
          });
        } catch (e) {
          return { threw: String(e) };
        }
      },
      [stealDir, path.join(wip, "comments.jsonl")],
    );

    // --- attack 6: replace the bridge function.
    report.attack6 = await a.win.evaluate(async () => {
      let assigned = false;
      try {
        window.electronAPI.isOwnerMachine = async () => true;
        assigned = true;
      } catch (e) {
        assigned = `threw ${e}`;
      }
      let answer = null;
      try {
        answer = await window.electronAPI.isOwnerMachine(["nope"], "nope");
      } catch (e) {
        answer = String(e);
      }
      return { assigned, answerAfterOverride: answer, frozen: Object.isFrozen(window.electronAPI) };
    });

    // --- the UI's own verdict, re-asked after a reload (does ["*"] stick?).
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 30000 });
    await sleep(1200);
    report.afterReload = await a.win.evaluate(() => ({
      navHasChannelLink: Boolean(document.getElementById("ui-channel-link")),
      exportPanel: Boolean(document.getElementById("ui-channel-start")),
    }));
    report.routesAfterReload = await probeRoutes(a);
    const p3 = plant("reload");
    report.exportSaveAfterReload = await a.win.evaluate(
      async ([dirPath, files]) => {
        try {
          return await window.electronAPI.saveExport({ dirPath, folder: "t2-after-reload", files });
        } catch (e) {
          return { threw: String(e) };
        }
      },
      [stealDir, p3.files],
    );
    await a.shot("03-after-reload");

    report.stealDirListing = fs.readdirSync(stealDir);
    report.mainLog = a.logs.stdout.join("").split("\n").filter((l) => /export|owner|refus/i.test(l)).slice(-15);
  } catch (e) {
    report.fatal = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t2-${SHAPE}.json`, report);
    await a.close();
  }
})();
