/**
 * SUPERSEDED by 31-folders-real.cjs. Kept only as the record of why.
 *
 * This version tried to replace window.electronAPI.pickDirectory from inside
 * the renderer. It cannot be done: contextBridge defines `electronAPI` as a
 * non-configurable property, so the attempt fails with
 *   "could not replace: TypeError: Cannot redefine property: electronAPI"
 * (see out/logs/ and the first run of this script). 31-folders-real.cjs
 * replaces Electron's own `dialog.showOpenDialog` in the MAIN process
 * instead, which works and leaves every product code path intact.
 */
/**
 * Area D / "Choose clips folder and data folder separately" + the handoff
 * panel's own fields, driven with real clicks in the real app.
 *
 * The native directory dialog cannot be driven under Xvfb, so
 * window.electronAPI.pickDirectory is replaced in the renderer with one that
 * answers a fixed path. Everything downstream of it (CampaignContext
 * setClipsDir/setDataDir, persistence, the footer, the handoff panel) is the
 * product's own code, driven by clicking the product's own buttons.
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, campaign, folders, stubPickDirectory } = require("./lib-D.cjs");

const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out/folders";

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const F = folders("folders");
  console.log("clips folder:", F.clips);
  console.log("data  folder:", F.data);

  const a = await boot({ label: "D-folders", outDir: OUT, seed: { "clipper.dataDirConfirmed": true } });
  try {
    console.log("booted:", await a.shot("workspace"));

    const canStub = await stubPickDirectory(a.win, F.clips);
    console.log("pickDirectory replaceable in the renderer:", canStub);

    // ---------------------------------------------------------------- 1
    console.log("\n--- 1. choose the CLIPS folder from the footer ---");
    await a.win.click("#ui-footer-clips");
    await a.win.waitForTimeout(600);
    console.log("footer after choosing clips:", await footerText(a));
    console.log("state:", JSON.stringify(pick(a.readState())));
    console.log(await a.shot("clips-chosen"));

    // ---------------------------------------------------------------- 2
    console.log("\n--- 2. choose the DATA folder from the footer, same path (must be refused) ---");
    await stubPickDirectory(a.win, F.clips);
    const dataBtns = await a.win.locator("#ui-footer-data").count();
    console.log("#ui-footer-data elements:", dataBtns);
    await a.win.locator("#ui-footer-data").first().click();
    await a.win.waitForTimeout(600);
    console.log("footer:", await footerText(a));
    console.log("visible alerts:", await alerts(a));
    console.log("state:", JSON.stringify(pick(a.readState())));
    console.log(await a.shot("data-same-as-clips"));

    // ---------------------------------------------------------------- 3
    console.log("\n--- 3. choose the DATA folder, a different path ---");
    await stubPickDirectory(a.win, F.data);
    await a.win.locator("#ui-footer-data").first().click();
    await a.win.waitForTimeout(600);
    console.log("footer:", await footerText(a));
    console.log("state:", JSON.stringify(pick(a.readState())));
    console.log(await a.shot("data-chosen"));

    // ---------------------------------------------------------------- 4
    console.log("\n--- 4. a path that is a FILE, not a directory ---");
    const asFile = path.join(F.root, "a-file.txt");
    fs.writeFileSync(asFile, "x");
    await stubPickDirectory(a.win, asFile);
    await a.win.click("#ui-footer-clips");
    await a.win.waitForTimeout(600);
    console.log("clipsDir now:", JSON.stringify(a.readState()["clipper.clipsDir"]));
    console.log("alerts:", await alerts(a));
    console.log(await a.shot("clips-is-a-file"));

    // ---------------------------------------------------------------- 5
    console.log("\n--- 5. a path that does NOT exist ---");
    const gone = path.join(F.root, "not-here", "deep");
    await stubPickDirectory(a.win, gone);
    await a.win.click("#ui-footer-clips");
    await a.win.waitForTimeout(600);
    console.log("clipsDir now:", JSON.stringify(a.readState()["clipper.clipsDir"]));
    console.log("alerts:", await alerts(a));

    // ---------------------------------------------------------------- 6
    console.log("\n--- 6. a trailing slash, then the same path without one ---");
    await stubPickDirectory(a.win, F.clips + "/");
    await a.win.click("#ui-footer-clips");
    await a.win.waitForTimeout(500);
    console.log("clipsDir after trailing slash:", JSON.stringify(a.readState()["clipper.clipsDir"]));
    await stubPickDirectory(a.win, F.data + "/");
    await a.win.locator("#ui-footer-data").first().click();
    await a.win.waitForTimeout(500);
    console.log("dataDir after trailing slash:", JSON.stringify(a.readState()["clipper.dataDir"]));
    console.log("alerts (clips vs data should still be seen as different folders):", await alerts(a));
    console.log(await a.shot("trailing-slash"));

    // ---------------------------------------------------------------- 7
    console.log("\n--- 7. a path with .. that resolves INTO the data folder ---");
    const dotdot = path.join(F.clips, "..", "ChannelData");
    await stubPickDirectory(a.win, dotdot);
    await a.win.click("#ui-footer-clips");
    await a.win.waitForTimeout(600);
    console.log("picked:", dotdot);
    console.log("clipsDir now:", JSON.stringify(a.readState()["clipper.clipsDir"]));
    console.log("dataDir  now:", JSON.stringify(a.readState()["clipper.dataDir"]));
    console.log("alerts:", await alerts(a));
    console.log(await a.shot("clips-dotdot-into-data"));

    // ---------------------------------------------------------------- 8
    console.log("\n--- 8. saveDirs / saveDirNames after all this ---");
    console.log(JSON.stringify(a.readState(), null, 1).slice(0, 2400));

    console.log("\n--- renderer console/page errors ---");
    console.log(JSON.stringify(a.logs.pageErrors));
    console.log(JSON.stringify(a.logs.console.filter((l) => /error|warn/i.test(l)).slice(0, 12), null, 1));
  } finally {
    await a.close();
  }
  process.exit(0);
})();

function pick(s) {
  return {
    clipsDir: s["clipper.clipsDir"],
    dataDir: s["clipper.dataDir"],
    dataDirConfirmed: s["clipper.dataDirConfirmed"],
    saveDir: s["clipper.saveDir"],
    saveDirs: s["clipper.saveDirs"],
  };
}
async function footerText(a) {
  return (await a.win.evaluate(() => {
    const f = document.querySelector("footer");
    return f ? f.innerText.replace(/\n+/g, " | ") : "<no footer>";
  })).slice(0, 400);
}
async function alerts(a) {
  return await a.win.evaluate(() =>
    Array.from(document.querySelectorAll('[role="alert"]')).map((e) => e.innerText.trim()).filter(Boolean),
  );
}
