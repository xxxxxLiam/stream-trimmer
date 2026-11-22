/**
 * Area D / order of actions and genuinely unwritable targets.
 *
 * The container runs as root, so chmod cannot make a directory unwritable.
 * Unwritability is produced the way a user really hits it instead: the
 * target path is a FILE, or its parent does not exist. Both give real errno
 * failures that no privilege bypasses.
 *
 * Also: change the clips folder after a download has started.
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { boot, campaign, folders, SCRATCH } = require("./lib-D.cjs");
const { loadVideo, addSegment, cut } = require("./lib-cut.cjs");

const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out/order";
const STUBJSON = `${SCRATCH}/stubD2/stub.json`;
const setStub = (p) => {
  const c = JSON.parse(fs.readFileSync(STUBJSON, "utf8"));
  fs.writeFileSync(STUBJSON, JSON.stringify({ ...c, ...p }, null, 2));
};

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  setStub({ delayMs: 0 });
  const F = folders("order");
  const AS_FILE = path.join(F.root, "this-is-a-file");
  fs.writeFileSync(AS_FILE, "not a directory\n");
  const NO_PARENT = path.join(F.root, "missing-parent", "sub", "dir");

  const a = await boot({
    label: "D-order", outDir: OUT,
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": F.clips, "clipper.dataDir": F.data, "clipper.saveDir": F.clips,
      "clipper.campaigns": [campaign("aud", "Audit D", F.clips, F.data)],
      "clipper.activeCampaign": "aud",
    },
  });
  const alerts = async () =>
    await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[role="alert"], [role="status"]')).map((e) => e.innerText.trim()).filter(Boolean));
  const hstatus = async () =>
    await a.win.evaluate(() => {
      const s = document.querySelector('section[aria-label="Editor handoff"]');
      const el = s && s.querySelector('[role="status"], [role="alert"]');
      return el ? el.innerText.trim() : "<none>";
    });

  try {
    await loadVideo(a);

    // ------------------------------------------------- 1. clips folder is a FILE
    console.log("=== 1. the clips folder setting points at a FILE ===");
    await a.win.evaluate(async (p) => { await window.electronAPI.setSetting("clipper.clipsDir", p); }, AS_FILE);
    console.log("editor:writeFcpxml into a file path:",
      JSON.stringify(await a.win.evaluate(async (p) => await window.electronAPI.editor.writeFcpxml({
        dirPath: p, filename: "Try", contents: '<?xml version="1.0"?>\n<fcpxml version="1.10"/>\n' }), AS_FILE)));
    console.log("editor:copyFiles into a file path:",
      JSON.stringify(await a.win.evaluate(async (p) => await window.electronAPI.editor.copyFiles({ dirPath: p, files: ["/etc/hostname"] }), AS_FILE)));
    console.log("editor:pathExists on a file:",
      JSON.stringify(await a.win.evaluate(async (p) => await window.electronAPI.editor.pathExists(p), AS_FILE)));

    // ------------------------------------------------- 2. parent does not exist
    console.log("\n=== 2. the target's parent directory does not exist ===");
    console.log("editor:writeFcpxml (mkdir -p is used, so this should SUCCEED and create the tree):",
      JSON.stringify(await a.win.evaluate(async (p) => await window.electronAPI.editor.writeFcpxml({
        dirPath: p, filename: "Try", contents: '<?xml version="1.0"?>\n<fcpxml version="1.10"/>\n' }), NO_PARENT)));
    console.log("tree created on disk:", fs.existsSync(NO_PARENT), fs.existsSync(NO_PARENT) ? fs.readdirSync(NO_PARENT) : "");

    // ------------------------------------------------- 3. clip:save into a file path
    console.log("\n=== 3. cut a clip while the clips folder setting points at a FILE ===");
    await a.win.waitForTimeout(600);
    await addSegment(a, 2, 8);
    const r3 = await cut(a, 30000);
    console.log("cut:", JSON.stringify(r3).slice(0, 600));
    console.log("alerts:", JSON.stringify(await alerts(), null, 1));
    console.log(await a.shot("clipsdir-is-a-file"));

    // ------------------------------------------------- 4. change the clips folder mid-download
    console.log("\n=== 4. change the clips folder AFTER a download has started ===");
    const SECOND = path.join(F.root, "Clips Two");
    fs.mkdirSync(SECOND, { recursive: true });
    await a.win.evaluate(async (p) => { await window.electronAPI.setSetting("clipper.clipsDir", p); }, F.clips);
    await a.win.reload();
    await a.win.waitForSelector("header", { timeout: 20000 });
    await a.win.waitForTimeout(2500);
    await loadVideo(a);
    setStub({ delayMs: 6000 });
    await addSegment(a, 20, 26);
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(1500);
    console.log("download under way; switching the clips folder to", SECOND);
    await a.win.evaluate(async (p) => { await window.electronAPI.setSetting("clipper.clipsDir", p); }, SECOND);
    await a.win.waitForTimeout(18000);
    console.log("folder A:", fs.readdirSync(F.clips));
    console.log("folder B:", fs.readdirSync(SECOND));
    console.log("alerts:", JSON.stringify(await alerts(), null, 1));
    console.log(await a.shot("folder-changed-mid-download"));
    setStub({ delayMs: 0 });

    // ------------------------------------------------- 5. CapCut drop folder that is a file
    console.log("\n=== 5. CapCut copy into a drop folder that is a file, and into a dead path ===");
    console.log("file:", JSON.stringify(await a.win.evaluate(async (p) => await window.electronAPI.editor.copyFiles({ dirPath: p, files: ["/etc/hostname"] }), AS_FILE)));
    console.log("dead: ", JSON.stringify(await a.win.evaluate(async () => await window.electronAPI.editor.copyFiles({ dirPath: "/tmp/gone-forever-xyz/drop", files: ["/tmp/also-not-here.mp4"] }))));

    // ------------------------------------------------- 6. CapCut: copy the same clip twice
    console.log("\n=== 6. copy the same clip into the drop folder twice (collision policy) ===");
    const DROP = path.join(F.root, "Drop");
    fs.mkdirSync(DROP, { recursive: true });
    const anyClip = [...fs.readdirSync(F.clips), ...fs.readdirSync(SECOND)].find((f) => f.endsWith(".mp4"));
    const clipPath = fs.existsSync(path.join(F.clips, anyClip || "")) ? path.join(F.clips, anyClip) : path.join(SECOND, anyClip || "");
    console.log("clip:", clipPath);
    for (let i = 1; i <= 3; i++) {
      const r = await a.win.evaluate(async ({ d, f }) => await window.electronAPI.editor.copyFiles({ dirPath: d, files: [f] }), { d: DROP, f: clipPath });
      console.log(`  copy ${i}:`, JSON.stringify(r));
    }
    console.log("drop folder:", fs.readdirSync(DROP));

    // ------------------------------------------------- 7. Export FCPXML twice in a row
    console.log("\n=== 7. Export FCPXML twice: overwrite or keep both? ===");
    await a.win.click('section[aria-label="Editor handoff"] button[aria-expanded]');
    await a.win.waitForTimeout(400);
    const before7 = fs.readdirSync(SECOND).concat(fs.readdirSync(F.clips));
    for (let i = 1; i <= 2; i++) {
      const b = a.win.locator('button:text-is("Export FCPXML")');
      if (await b.isDisabled()) { console.log(`  pass ${i}: button disabled`); break; }
      await b.click();
      await a.win.waitForTimeout(2500);
      console.log(`  pass ${i}:`, await hstatus());
    }
    console.log("folder A .fcpxml:", fs.readdirSync(F.clips).filter((f) => f.endsWith(".fcpxml")));
    console.log("folder B .fcpxml:", fs.readdirSync(SECOND).filter((f) => f.endsWith(".fcpxml")));
    console.log(await a.shot("export-twice"));

    console.log("\n--- page errors ---", JSON.stringify(a.logs.pageErrors));
  } finally {
    await a.close();
  }
  process.exit(0);
})().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
