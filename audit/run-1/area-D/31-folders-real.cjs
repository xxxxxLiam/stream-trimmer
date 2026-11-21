/**
 * Area D / "Choose clips folder and data folder separately", driven with real
 * clicks on the product's own footer chips.
 *
 * Harness substitution, disclosed: Electron's own `dialog.showOpenDialog` is a
 * native modal the driver cannot click, so it is replaced IN ELECTRON (not in
 * product code) with one that resolves to a chosen path, the same way area A's
 * harness does it. Everything downstream — dialog:pickDirectory,
 * CampaignContext setClipsDir/setDataDir, the separation rule, persistence,
 * the footer and the handoff panel — is the product's own code.
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, campaign, folders } = require("./lib-D.cjs");

const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out/folders";

async function picker(app, p) {
  await app.evaluate(({ dialog }, paths) => {
    dialog.showOpenDialog = async () =>
      paths === null ? { canceled: true, filePaths: [] } : { canceled: false, filePaths: paths };
  }, p === null ? null : [p]);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const F = folders("foldersreal");
  const SECOND = path.join(F.root, "Other Clips");
  const AS_FILE = path.join(F.root, "a-plain-file.txt");
  const GONE = path.join(F.root, "no-such-folder", "deep");
  const LINK = path.join(F.root, "LinkToClips");
  fs.mkdirSync(SECOND);
  fs.writeFileSync(AS_FILE, "x");
  fs.symlinkSync(F.clips, LINK);
  console.log("clips:", F.clips, "\ndata: ", F.data);

  const a = await boot({
    label: "D-folders-real", outDir: OUT,
    seed: {
      "clipper.campaigns": [campaign("aud", "Audit D", "", "")],
      "clipper.activeCampaign": "aud",
    },
  });
  const st = () => {
    const s = a.readState();
    return {
      clipsDir: s["clipper.clipsDir"], dataDir: s["clipper.dataDir"],
      confirmed: s["clipper.dataDirConfirmed"], saveDir: s["clipper.saveDir"],
      saveDirs: s["clipper.saveDirs"],
      campaign: (s["clipper.campaigns"] || []).map((c) => ({ clipsDir: c.clipsDir, dataDir: c.dataDir })),
    };
  };
  const footer = async () => (await a.win.evaluate(() => document.querySelector("footer")?.innerText.replace(/\n+/g, " | "))) || "";
  const alerts = async () => await a.win.evaluate(() =>
    Array.from(document.querySelectorAll('footer [role="alert"], [role="alert"]')).map((e) => e.innerText.trim()).filter(Boolean));
  const clipsChip = () => a.win.locator("#ui-footer-clips");
  const dataChip = () => a.win.locator("#ui-footer-data").first();

  try {
    console.log("\nfooter at the start:", await footer());
    console.log("state:", JSON.stringify(st()));
    console.log(await a.shot("start"));

    // ------------------------------------------------- 1. choose the clips folder
    console.log("\n=== 1. choose the clips folder ===");
    await picker(a.app, F.clips);
    await clipsChip().click();
    await a.win.waitForTimeout(900);
    console.log("footer:", await footer());
    console.log("state:", JSON.stringify(st(), null, 1));
    console.log("alerts:", await alerts());
    console.log(await a.shot("clips-chosen"));

    // ------------------------------------------------- 2. the data folder is suggested
    console.log("\n=== 2. the suggested data folder, and the Confirm step ===");
    console.log("data chip text:", await a.win.evaluate(() => document.querySelector("#ui-footer-data")?.innerText.replace(/\n+/g, " ")));
    await dataChip().click();
    await a.win.waitForTimeout(500);
    console.log("confirm popover:", await a.win.evaluate(() =>
      document.querySelector('[aria-label="Confirm the data folder"]')?.innerText.replace(/\n+/g, " | ") ?? "<none>"));
    console.log(await a.shot("data-suggested"));
    console.log("does the suggested data folder exist on disk?", fs.existsSync(st().dataDir || "/nope"));
    const useBtn = a.win.locator('button:text-is("Use folder")');
    if (await useBtn.count()) {
      await useBtn.click();
      await a.win.waitForTimeout(600);
      console.log("clicked 'Use folder'");
    } else {
      console.log("*** there is no Confirm step: dataDirConfirmed is already true,");
      console.log("    so the user is never asked about the folder their channel data goes to ***");
      await a.win.keyboard.press("Escape");
      await a.win.waitForTimeout(300);
    }
    console.log("state:", JSON.stringify(st(), null, 1));
    console.log("footer:", await footer());

    // ------------------------------------------------- 3. data == clips, refused?
    console.log("\n=== 3. point the data folder at the clips folder ===");
    await picker(a.app, F.clips);
    await dataChip().click();
    await a.win.waitForTimeout(800);
    console.log("alerts:", await alerts());
    console.log("state:", JSON.stringify(st(), null, 1));
    console.log(await a.shot("data-same"));

    // ------------------------------------------------- 4. the same folder through a SYMLINK
    console.log("\n=== 4. point the data folder at a SYMLINK to the clips folder ===");
    await picker(a.app, LINK);
    await dataChip().click();
    await a.win.waitForTimeout(800);
    console.log("alerts:", await alerts());
    console.log("state:", JSON.stringify(st(), null, 1));
    console.log("clips and data now resolve to the same directory:",
      fs.realpathSync(st().clipsDir) === fs.realpathSync(st().dataDir));
    console.log(await a.shot("data-symlink"));

    // ------------------------------------------------- 5. the same folder with /. and /..
    console.log("\n=== 5. the same folder written with /. and with /.. ===");
    for (const p of [F.clips + "/.", path.join(F.clips, "..", path.basename(F.clips))]) {
      await picker(a.app, p);
      await dataChip().click();
      await a.win.waitForTimeout(700);
      console.log(`  picked ${JSON.stringify(p)}`);
      console.log(`    alerts: ${JSON.stringify(await alerts())}`);
      console.log(`    dataDir now ${JSON.stringify(st().dataDir)}`);
      console.log(`    same directory as clips on disk: ${fs.realpathSync(st().dataDir) === fs.realpathSync(st().clipsDir)}`);
    }
    console.log(await a.shot("data-dot-paths"));

    // ------------------------------------------------- 6. put it back, then odd paths
    console.log("\n=== 6. a path that is a FILE, a path that does not exist, a trailing slash ===");
    await picker(a.app, F.data);
    await dataChip().click();
    await a.win.waitForTimeout(600);
    console.log("data restored to:", JSON.stringify(st().dataDir));
    for (const [what, p] of [["a file", AS_FILE], ["a path that does not exist", GONE], ["a trailing slash", SECOND + "/"]]) {
      await picker(a.app, p);
      await clipsChip().click();
      await a.win.waitForTimeout(700);
      console.log(`  ${what}: picked ${JSON.stringify(p)}`);
      console.log(`    alerts: ${JSON.stringify(await alerts())}`);
      console.log(`    clipsDir now ${JSON.stringify(st().clipsDir)}`);
      console.log(`    footer: ${(await footer()).slice(0, 140)}`);
    }
    console.log(await a.shot("odd-paths"));

    // ------------------------------------------------- 7. cancel the dialog
    console.log("\n=== 7. cancel the dialog ===");
    const before = JSON.stringify(st());
    await picker(a.app, null);
    await clipsChip().click();
    await a.win.waitForTimeout(600);
    console.log("unchanged after cancel:", JSON.stringify(st()) === before);
    console.log("alerts:", await alerts());

    // ------------------------------------------------- 8. does the handoff follow?
    console.log("\n=== 8. the handoff panel writes its file into whichever folder is current ===");
    await picker(a.app, SECOND);
    await clipsChip().click();
    await a.win.waitForTimeout(700);
    console.log("clipsDir:", JSON.stringify(st().clipsDir));
    console.log("state at the end:", JSON.stringify(st(), null, 1));
    console.log("--- page errors ---", JSON.stringify(a.logs.pageErrors));
  } finally { await a.close(); }
  process.exit(0);
})().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
