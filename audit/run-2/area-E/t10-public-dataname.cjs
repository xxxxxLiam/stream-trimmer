#!/usr/bin/env node
/**
 * t10-public-dataname.cjs
 *
 * src/lib/campaigns.ts gates the suggested data-folder name on the build flag
 * ("The exporter's own name only exists in a build that has the exporter; a
 * public build must not carry it"). electron/settingsStore.cjs has its own copy
 * of the same rule and is NOT gated — it is plain CommonJS that ships in every
 * shape. This drives the v3 -> v4 upgrade the main process performs on launch
 * and reads what the PUBLIC build puts on disk and on screen.
 *
 * Seed = a v3 install: clipper.saveDir set, no clipsDir, no dataDir.
 *
 * usage: xvfb-run -a ... node t10-public-dataname.cjs <shape>
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");

const SHAPE = process.argv[2] || "public";

(async () => {
  const report = { shape: SHAPE, startedAt: new Date().toISOString() };
  const root = stubRoot(`t10-${SHAPE}`);
  setStub(root, { videos: 2 });
  const home = fs.mkdtempSync("/tmp/r2e-v3home-");
  const legacy = path.join(home, "clips");
  fs.mkdirSync(legacy, { recursive: true });

  const a = await launch({
    shape: SHAPE,
    label: `t10-${SHAPE}`,
    cwd: root,
    // A v3 install, exactly as inventory.md describes the old key set.
    seed: { "clipper.saveDir": legacy, "clipper.saveDirs": [legacy] },
  });
  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    const skip = a.win.locator('button:has-text("Continue without signing in")');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await sleep(1500);

    report.settingsOnDisk = a.readState();
    report.migrated = {
      clipsDir: report.settingsOnDisk["clipper.clipsDir"],
      dataDir: report.settingsOnDisk["clipper.dataDir"],
      dataDirConfirmed: report.settingsOnDisk["clipper.dataDirConfirmed"],
      dataDirMentionsChannel: /channel-data/.test(String(report.settingsOnDisk["clipper.dataDir"] || "")),
    };

    // What the renderer got through the preload snapshot, and what is on screen.
    report.renderer = await a.win.evaluate(() => {
      const all = window.electronAPI?.settingsSnapshot || null;
      const text = document.body.innerText;
      return {
        settingsSnapshotDataDir: all ? all["clipper.dataDir"] : null,
        bodyHasChannelData: /channel-data/.test(text),
        bodyHasChannelDataWords: /Channel data/.test(text),
        dataLines: text.split("\n").filter((l) => /data/i.test(l)).slice(0, 12),
      };
    });
    await a.shot("01-footer-after-v3-upgrade");

    // Open the footer's data-folder control, which is where the path is shown.
    const dataChip = a.win.locator("#ui-footer-data");
    report.footer = { exists: await dataChip.count() };
    if (report.footer.exists) {
      report.footer.title = await dataChip.first().getAttribute("title");
      report.footer.text = await dataChip.first().innerText();
      await dataChip.first().click().catch(() => {});
      await sleep(600);
      report.footer.afterClick = await a.win.evaluate(() => {
        const t = document.body.innerText;
        return { hasChannelData: /channel-data/.test(t), lines: t.split("\n").filter((l) => /channel-data|data folder/i.test(l)).slice(0, 10) };
      });
      await a.shot("02-data-folder-popover");
    }

    // Settings popover too (where "Clear unfinished" and the folders live).
    const settingsBtn = a.win.locator("#ui-settings");
    if (await settingsBtn.count()) {
      await settingsBtn.first().click().catch(() => {});
      await sleep(600);
      report.settingsPanel = await a.win.evaluate(() => {
        const t = document.body.innerText;
        return { hasChannelData: /channel-data/.test(t), lines: t.split("\n").filter((l) => /channel-data/.test(l)).slice(0, 10) };
      });
      await a.shot("03-settings-panel");
    }
  } catch (e) {
    report.fatal = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t10-${SHAPE}.json`, report);
    await a.close();
  }
})();
