/**
 * Area D / saving a finished clip, and what happens when the target folder
 * goes wrong between choosing it and saving into it.
 *
 * Real app, real clicks, real ffmpeg cut. Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { boot, campaign, folders, SCRATCH } = require("./lib-D.cjs");
const { loadVideo, addSegment, cut } = require("./lib-cut.cjs");

const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out/save";
const STUBJSON = `${SCRATCH}/stubD2/stub.json`;

function setStub(patch) {
  const cur = JSON.parse(fs.readFileSync(STUBJSON, "utf8"));
  fs.writeFileSync(STUBJSON, JSON.stringify({ ...cur, ...patch }, null, 2));
}
function probe(file) {
  try {
    const j = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]).toString());
    const v = j.streams.find((s) => s.codec_type === "video");
    return { dur: j.format.duration, size: j.format.size, wh: v && `${v.width}x${v.height}`, fps: v && v.avg_frame_rate };
  } catch (e) { return { error: String(e.stderr || e.message).trim().slice(0, 160) }; }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  setStub({ delayMs: 0, exitCode: 0, writeMedia: true });
  const F = folders("save");

  // A file already sitting where the next clip will be named: does the app
  // overwrite it silently, or keep both?
  const collide = path.join(F.clips, "AUD-stub0000001-01.mp4");
  fs.writeFileSync(collide, "THIS IS THE USER'S EARLIER CLIP, DO NOT LOSE IT\n");
  const collideBytes = fs.statSync(collide).size;
  console.log("pre-existing file:", collide, collideBytes, "bytes");

  const a = await boot({
    label: "D-save", outDir: OUT,
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": F.clips, "clipper.dataDir": F.data, "clipper.saveDir": F.clips,
      "clipper.campaigns": [campaign("aud", "Audit D", F.clips, F.data)],
      "clipper.activeCampaign": "aud",
    },
  });
  const alerts = async () =>
    await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('[role="alert"], [role="status"]')).map((e) => e.innerText.trim()).filter(Boolean).slice(0, 8));

  try {
    await loadVideo(a);

    // ------------------------------------------------- 1. the filename collision
    console.log("\n=== 1. the clip is named over a file that already exists ===");
    await addSegment(a, 2, 8);
    console.log("cut:", JSON.stringify(await cut(a)));
    console.log("clips folder:", fs.readdirSync(F.clips));
    const after = fs.existsSync(collide) ? fs.readFileSync(collide) : null;
    console.log("the pre-existing file is now", after ? after.length + " bytes" : "GONE");
    console.log("still the user's text?", after ? after.toString("utf8", 0, 20) === "THIS IS THE USER'S E" : "n/a");
    console.log("probe of what is at that name now:", JSON.stringify(probe(collide)));
    console.log("toast:", await alerts());
    console.log(await a.shot("collision"));

    // ------------------------------------------------- 2. the saved clip itself
    console.log("\n=== 2. the saved clip is a real, correct cut ===");
    for (const f of fs.readdirSync(F.clips).filter((x) => x.endsWith(".mp4"))) {
      console.log(` ${f}: ${JSON.stringify(probe(path.join(F.clips, f)))}`);
    }

    // ------------------------------------------------- 3. folder deleted mid-download
    console.log("\n=== 3. the clips folder is deleted while the download runs ===");
    setStub({ delayMs: 4000 });
    await addSegment(a, 20, 26);
    await a.win.click("#ui-cut");
    await a.win.waitForTimeout(1200);
    fs.rmSync(F.clips, { recursive: true, force: true });
    console.log("clips folder removed. exists:", fs.existsSync(F.clips));
    await a.win.waitForTimeout(16000);
    console.log("alerts/status:", await alerts());
    console.log("clips folder recreated by the app?", fs.existsSync(F.clips), fs.existsSync(F.clips) ? fs.readdirSync(F.clips) : "");
    console.log(await a.shot("folder-deleted"));
    setStub({ delayMs: 0 });

    // ------------------------------------------------- 4. read-only folder
    console.log("\n=== 4. the clips folder is read-only ===");
    fs.mkdirSync(F.clips, { recursive: true });
    fs.chmodSync(F.clips, 0o500);
    console.log("mode:", (fs.statSync(F.clips).mode & 0o777).toString(8));
    await a.win.waitForTimeout(500);
    await addSegment(a, 40, 46);
    const r4 = await cut(a, 30000);
    console.log("cut result:", JSON.stringify(r4).slice(0, 700));
    console.log("alerts/status:", await alerts());
    console.log(await a.shot("read-only"));

    // ------------------------------------------------- 5. FCPXML into a read-only folder
    console.log("\n=== 5. Export FCPXML into the read-only folder ===");
    const expanded = await a.win.locator('section[aria-label="Editor handoff"] button[aria-expanded]').getAttribute("aria-expanded");
    if (expanded !== "true") await a.win.click('section[aria-label="Editor handoff"] button[aria-expanded]');
    await a.win.waitForTimeout(400);
    const exp = a.win.locator('button:text-is("Export FCPXML")');
    console.log("Export FCPXML disabled:", await exp.isDisabled());
    if (!(await exp.isDisabled())) {
      await exp.click();
      await a.win.waitForTimeout(3000);
      console.log("handoff status:", await a.win.evaluate(() => {
        const s = document.querySelector('section[aria-label="Editor handoff"]');
        const el = s.querySelector('[role="status"], [role="alert"]');
        return el ? el.innerText.trim() : "<none>";
      }));
    }
    console.log(await a.shot("fcpxml-readonly"));
    fs.chmodSync(F.clips, 0o700);

    // ------------------------------------------------- 6. nothing lost?
    console.log("\n=== 6. after all the failures, is the session's work still there ===");
    console.log("segments / downloads / panel:", await a.win.evaluate(() => ({
      footerSaved: document.querySelector("footer")?.innerText.match(/(\d+) saved/)?.[1],
      sendAllNote: Array.from(document.querySelectorAll('section[aria-label="Editor handoff"] p')).map((p) => p.innerText.trim()).filter((t) => /Send all/.test(t)),
    })));
    console.log("--- page errors ---", JSON.stringify(a.logs.pageErrors));
  } finally {
    try { fs.chmodSync(F.clips, 0o700); } catch {}
    await a.close();
  }
  process.exit(0);
})().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
