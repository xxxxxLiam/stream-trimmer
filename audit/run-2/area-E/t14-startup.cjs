#!/usr/bin/env node
/**
 * t14-startup.cjs — T10's own note: "export:save and the renderer's ownerGate
 * now ask main even for `*` lists; a `*` build therefore calls the owner check
 * once at startup where it did not before."
 *
 * Measures, per shape: how long after the page is interactive the "Channel data"
 * entry appears, and whether the header moves when it does (useOwnerAccess
 * starts false, so the entry is inserted after the first paint).
 *
 * usage: xvfb-run -a ... node t14-startup.cjs
 */
const fs = require("node:fs");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");

(async () => {
  const report = { startedAt: new Date().toISOString(), shapes: {} };
  const root = stubRoot("t14");
  setStub(root, { videos: 2 });

  for (const shape of ["owner-star", "owner-hash", "owner-other", "public"]) {
    const dataDir = fs.mkdtempSync("/tmp/r2e-data-t14-");
    const a = await launch({
      shape,
      label: `t14-${shape}`,
      cwd: root,
      seed: { "clipper.dataDir": dataDir, "clipper.dataDirConfirmed": true, "clipper.clipsDir": dataDir, "clipper.saveDir": dataDir, "clipper.signInSkipped": true },
    });
    try {
      const t0 = Date.now();
      await a.win.waitForSelector("header", { timeout: 30000 });
      const headerReadyMs = Date.now() - t0;
      const before = await a.win.evaluate(() => {
        const h = document.querySelector("header");
        const r = h ? h.getBoundingClientRect() : null;
        return { link: Boolean(document.getElementById("ui-channel-link")), headerHeight: r ? Math.round(r.height) : null, navText: h ? h.innerText.replace(/\n/g, " | ").slice(0, 160) : null };
      });
      let linkMs = null;
      try {
        await a.win.waitForSelector("#ui-channel-link", { timeout: 8000 });
        linkMs = Date.now() - t0;
      } catch {
        linkMs = null;
      }
      const after = await a.win.evaluate(() => {
        const h = document.querySelector("header");
        const r = h ? h.getBoundingClientRect() : null;
        const l = document.getElementById("ui-channel-link");
        return {
          link: Boolean(l),
          headerHeight: r ? Math.round(r.height) : null,
          navText: h ? h.innerText.replace(/\n/g, " | ").slice(0, 160) : null,
          linkRect: l ? (({ x, y, width, height }) => ({ x: Math.round(x), y: Math.round(y), width: Math.round(width), height: Math.round(height) }))(l.getBoundingClientRect()) : null,
        };
      });
      report.shapes[shape] = {
        headerReadyMs,
        linkPresentAtFirstLook: before.link,
        linkAppearedAfterMs: linkMs,
        headerHeightBefore: before.headerHeight,
        headerHeightAfter: after.headerHeight,
        headerHeightChanged: before.headerHeight !== after.headerHeight,
        navTextBefore: before.navText,
        navTextAfter: after.navText,
        linkRect: after.linkRect,
      };
      await a.shot(`01-${shape}-header`);
    } catch (e) {
      report.shapes[shape] = { fatal: String(e && e.stack ? e.stack : e) };
    } finally {
      await a.close();
    }
    await sleep(500);
  }
  save("t14-startup.json", report);
  console.log(JSON.stringify(report, null, 1));
})();
