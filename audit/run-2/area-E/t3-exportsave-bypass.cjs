#!/usr/bin/env node
/**
 * t3-exportsave-bypass.cjs
 *
 * T10 item 2 gated `export:save` on `ownerGate.isOwner()`, and ownerCheck.cjs
 * REMEMBERS the verdict of the last `owner:check` call — a call whose list and
 * salt both come from the renderer. So the question is whether a page script
 * can set that verdict itself.
 *
 * Order matters (every check overwrites the verdict), so this script drives one
 * call then one save, in sequence, and records the pair:
 *
 *   A. save with no check yet                -> must refuse (fail closed)
 *   B. check(["*"], "")      then save       -> ?
 *   C. check([mine], salt)   then save       -> ?   (the E-6 oracle)
 *   D. check([wrong], salt)  then save       -> must refuse again
 *   E. after a reload, save                  -> ?
 *
 * Each save plants its own /tmp/ytchan-<rand>/videos.csv first, which is the
 * exact shape exportSave.cjs insists on, and a ytchanwip- folder too.
 *
 * usage: xvfb-run -a ... node t3-exportsave-bypass.cjs <shape>
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");
const { SALT, MINE_HASH, OTHER_HASH } = require("./mirror.cjs");

const SHAPE = process.argv[2] || "owner-other";

(async () => {
  const report = { shape: SHAPE, salt: SALT, startedAt: new Date().toISOString() };
  const root = stubRoot(`t3-${SHAPE}`);
  setStub(root, { videos: 2 });
  const dest = fs.mkdtempSync("/tmp/r2e-t3-dest-");

  const a = await launch({
    shape: SHAPE,
    label: `t3-${SHAPE}`,
    cwd: root,
    seed: { "clipper.clipsDir": dest, "clipper.saveDir": dest, "clipper.dataDir": dest, "clipper.dataDirConfirmed": true },
  });

  const plant = (prefix, tag) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
    const file = path.join(dir, "videos.csv");
    fs.writeFileSync(file, `﻿"video_id"\r\n"planted-${tag}"\r\n`);
    return { dir, files: [{ name: `${tag}.csv`, path: file }] };
  };

  const trySave = (folder, files) =>
    a.win.evaluate(
      async ([dirPath, folderName, fileList]) => {
        try {
          return await window.electronAPI.saveExport({ dirPath, folder: folderName, files: fileList });
        } catch (e) {
          return { threw: String(e) };
        }
      },
      [dest, folder, files],
    );

  const check = (list, salt) =>
    a.win.evaluate(
      async ([l, s]) => {
        try {
          return await window.electronAPI.isOwnerMachine(l, s);
        } catch (e) {
          return `threw ${e}`;
        }
      },
      [list, salt],
    );

  const onDisk = (folder) => {
    const p = path.join(dest, folder);
    try {
      return fs.readdirSync(p);
    } catch {
      return null;
    }
  };

  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    await sleep(2000); // let the renderer's own checkOwnerAccess() settle first

    report.uiVisible = await a.win.evaluate(() => ({
      navHasChannelLink: Boolean(document.getElementById("ui-channel-link")),
      exportPanel: Boolean(document.getElementById("ui-channel-start")),
    }));

    // A — fail closed with no doctored check.
    {
      const p = plant("ytchan-", "A-noCheck");
      report.A = { save: await trySave("A-noCheck", p.files) };
      report.A.onDisk = onDisk("A-noCheck");
    }

    // B — ["*"] then save, back to back.
    {
      const checked = await check(["*"], "");
      const p = plant("ytchan-", "B-star");
      const saved = await trySave("B-star", p.files);
      report.B = { check: checked, save: saved, onDisk: onDisk("B-star") };
    }

    // B2 — same, but the file sits in a LIVE checkpoint folder (ytchanwip-),
    // which also startsWith exportSave.cjs's "ytchan-" prefix.
    {
      const checked = await check(["*"], "");
      const p = plant("ytchanwip-", "B2-wip");
      const saved = await trySave("B2-wip", p.files);
      report.B2 = { check: checked, save: saved, onDisk: onDisk("B2-wip"), wipDir: p.dir };
    }

    // C — the oracle: this machine's hash under the build's real salt.
    {
      const checked = await check([MINE_HASH], SALT);
      const p = plant("ytchan-", "C-oracle");
      const saved = await trySave("C-oracle", p.files);
      report.C = { check: checked, save: saved, onDisk: onDisk("C-oracle") };
    }

    // D — a wrong hash must put it back to refusing.
    {
      const checked = await check([OTHER_HASH === MINE_HASH ? "f".repeat(64) : OTHER_HASH], SALT);
      const p = plant("ytchan-", "D-wrong");
      const saved = await trySave("D-wrong", p.files);
      report.D = { check: checked, save: saved, onDisk: onDisk("D-wrong") };
    }

    // E — does the flipped verdict survive a reload of the renderer?
    {
      await check(["*"], "");
      await a.win.reload();
      await a.win.waitForSelector("header", { timeout: 30000 });
      await sleep(2000);
      const p = plant("ytchan-", "E-afterReload");
      const saved = await trySave("E-afterReload", p.files);
      report.E = { save: saved, onDisk: onDisk("E-afterReload") };
    }

    report.destListing = fs.readdirSync(dest);
    report.mainLog = a.logs.stdout.join("").split("\n").filter((l) => /export|owner|refus/i.test(l)).slice(-20);
    await a.shot("01-after-bypass-attempts");
  } catch (e) {
    report.fatal = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t3-${SHAPE}.json`, report);
    await a.close();
  }
})();
