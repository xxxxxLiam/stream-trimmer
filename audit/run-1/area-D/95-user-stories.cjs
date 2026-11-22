/**
 * Area D / user stories 3, 11 and 12, which the earlier scripts did not cover
 * end to end. The others are covered by 40/50/60/61/70/80/90.
 *
 *  3. Three clips in one session, then one send to Final Cut.
 * 11. Come back tomorrow: restart the app and send yesterday's clips.
 * 12. The external drive is unplugged: the clips folder is gone.
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { boot, campaign, folders, SCRATCH } = require("./lib-D.cjs");
const { loadVideo, addSegment, cut } = require("./lib-cut.cjs");

const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out/stories";
const DTD = `${SCRATCH}/FCPXMLv1_10.dtd`;

const hstatus = (a) => a.win.evaluate(() => {
  const s = document.querySelector('section[aria-label="Editor handoff"]');
  const el = s && s.querySelector('[role="status"], [role="alert"]');
  return el ? el.innerText.trim() : "<none>";
});
const openPanel = async (a) => {
  const e = await a.win.locator('section[aria-label="Editor handoff"] button[aria-expanded]').getAttribute("aria-expanded");
  if (e !== "true") await a.win.click('section[aria-label="Editor handoff"] button[aria-expanded]');
  await a.win.waitForTimeout(400);
};
const field = (a, label) =>
  a.win.locator(`section[aria-label="Editor handoff"] label:has(> span:text-is("${label}")) input`).first();
const xp = (f, q) => { try { return execFileSync("xmllint", ["--xpath", q, f]).toString().trim(); } catch { return "<none>"; } };
const dtdOk = (f) => { try { execFileSync("xmllint", ["--noout", "--dtdvalid", DTD, f], { stdio: ["ignore", "pipe", "pipe"] }); return "OK"; } catch (e) { return "FAIL " + String(e.stderr).trim(); } };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const F = folders("stories");
  const LIB = path.join(F.root, "Studio.fcpbundle");
  fs.mkdirSync(LIB);
  const seed = {
    "clipper.dataDirConfirmed": true,
    "clipper.clipsDir": F.clips, "clipper.dataDir": F.data, "clipper.saveDir": F.clips,
    "clipper.campaigns": [campaign("aud", "Ramadan Reels", F.clips, F.data)],
    "clipper.activeCampaign": "aud",
    "clipper.editorHandoff": {
      aud: {
        afterCutting: "nothing", eventName: "campaign", capcutDropDir: "", openCapCut: false,
        fcpLibrary: LIB, mediaEvent: "Raw", projectEvent: "Edits", createProject: true,
        projectNamePattern: "{clipId} {label}", timelineFormat: { kind: "vertical", width: 1080, height: 1920, fps: "30" },
      },
    },
  };

  // ======================================================= STORY 3
  console.log("######## STORY 3: three clips in one session, then one send ########");
  {
    const a = await boot({ label: "D-story3", outDir: `${OUT}/story3`, seed });
    try {
      await loadVideo(a);
      for (const [from, to] of [[2, 8], [120, 126], [240, 246]]) {
        await addSegment(a, from, to);
        const r = await cut(a);
        console.log(`  cut ${from}-${to}: ${JSON.stringify(r).slice(0, 140)}`);
      }
      console.log("  clips on disk:", fs.readdirSync(F.clips));
      await openPanel(a);
      console.log("  panel note:", await a.win.evaluate(() =>
        Array.from(document.querySelectorAll('section[aria-label="Editor handoff"] p')).map((p) => p.innerText.trim()).find((t) => /Send all/.test(t))));
      await a.win.click('button:text-is("Send all to Final Cut Pro")');
      await a.win.waitForTimeout(4000);
      console.log("  status:", await hstatus(a));
      const docs = fs.readdirSync(F.clips).filter((f) => f.endsWith(".fcpxml"));
      console.log("  documents written:", docs);
      for (const d of docs) {
        const f = path.join(F.clips, d);
        fs.copyFileSync(f, path.join(OUT, "story3-" + d));
        console.log(`   ${d}: DTD=${dtdOk(f)}  assets=${xp(f, "count(//asset)")} asset-clips=${xp(f, "count(//asset-clip)")} projects=${xp(f, "count(//project)")} events=${xp(f, "count(//event)")}`);
        console.log(`     library option: ${xp(f, 'string(//import-options/option/@value)')}`);
        console.log(`     project names:  ${[1, 2, 3].map((i) => xp(f, `string(//event[2]/project[${i}]/@name)`)).join(" | ")}`);
      }
      console.log("  shot:", await a.shot("three-clips-sent"));

      // STORY 4 (re-asserted here): cut one more and watch the document change
      console.log("\n  --- then set 'After cutting: Send to Final Cut' and cut a fourth clip ---");
      const doc = path.join(F.clips, fs.readdirSync(F.clips).find((f) => f.endsWith(".fcpxml")));
      const before = fs.readFileSync(doc, "utf8");
      fs.writeFileSync(path.join(OUT, "story4-before.fcpxml"), before);
      await a.win.selectOption('section[aria-label="Editor handoff"] select >> nth=0', "finalcut");
      await a.win.waitForTimeout(400);
      await addSegment(a, 400, 406);
      console.log("  cut 4:", JSON.stringify(await cut(a)).slice(0, 140));
      await a.win.waitForTimeout(4000);
      const after = fs.readFileSync(doc, "utf8");
      fs.writeFileSync(path.join(OUT, "story4-after.fcpxml"), after);
      console.log("  same path:", doc);
      console.log(`  assets before=${xp(path.join(OUT, "story4-before.fcpxml"), "count(//asset)")}  after=${xp(path.join(OUT, "story4-after.fcpxml"), "count(//asset)")}`);
      console.log(`  projects before=${xp(path.join(OUT, "story4-before.fcpxml"), "count(//project)")}  after=${xp(path.join(OUT, "story4-after.fcpxml"), "count(//project)")}`);
      console.log("  document changed:", before !== after);
      console.log("  shot:", await a.shot("document-replaced"));
    } finally { await a.close(); }
  }

  // ======================================================= STORY 11
  console.log("\n\n######## STORY 11: come back tomorrow and send yesterday's clips ########");
  {
    const a = await boot({ label: "D-story11", outDir: `${OUT}/story11`, seed: { ...seed,
      "clipper.downloads": fs.readdirSync(F.clips).filter((f) => f.endsWith(".mp4")).map((f, i) => ({
        id: "y" + i, kind: "clip", label: f, path: path.join(F.clips, f), dir: F.clips, savedAt: Date.now() - 86400000 })) } });
    try {
      console.log("  clips still on disk:", fs.readdirSync(F.clips).filter((f) => f.endsWith(".mp4")));
      console.log("  footer:", await a.win.evaluate(() => document.querySelector("footer")?.innerText.replace(/\n+/g, " | ")));
      await openPanel(a);
      console.log("  Library field remembered:", JSON.stringify(await field(a, "Library").inputValue()));
      console.log("  Event for the raw clip remembered:", JSON.stringify(await field(a, "Event for the raw clip").inputValue()));
      console.log("  Export FCPXML disabled:", await a.win.locator('button:text-is("Export FCPXML")').isDisabled());
      console.log("  Send all disabled:", await a.win.locator('button:text-is("Send all to Final Cut Pro")').isDisabled());
      console.log("  Copy file path disabled:", await a.win.locator('button:text-is("Copy file path")').isDisabled());
      console.log("  Send all note:", await a.win.evaluate(() =>
        Array.from(document.querySelectorAll('section[aria-label="Editor handoff"] p')).map((p) => p.innerText.trim()).find((t) => /Send all/.test(t))));
      console.log("  drag handles on screen:", await a.win.locator('[aria-label*="Drag"]').count());
      console.log("  shot:", await a.shot("day-two"));
      console.log("  => yesterday's clips are on disk and in the Downloads list, but the handoff");
      console.log("     panel is scoped to this session, so they cannot be sent any more.");
    } finally { await a.close(); }
  }

  // ======================================================= STORY 12
  console.log("\n\n######## STORY 12: the external drive is unplugged ########");
  {
    const G = folders("drive");
    const DRIVE = path.join(G.root, "ExternalDrive", "Clips");
    fs.mkdirSync(DRIVE, { recursive: true });
    const a = await boot({ label: "D-story12", outDir: `${OUT}/story12`, seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": DRIVE, "clipper.dataDir": G.data, "clipper.saveDir": DRIVE,
      "clipper.campaigns": [campaign("aud", "Ramadan Reels", DRIVE, G.data)],
      "clipper.activeCampaign": "aud",
      "clipper.editorHandoff": { aud: { ...seed["clipper.editorHandoff"].aud, afterCutting: "nothing" } },
    } });
    try {
      await loadVideo(a);
      await addSegment(a, 2, 8);
      console.log("  cut while the drive is there:", JSON.stringify(await cut(a)).slice(0, 140));
      console.log("  on the drive:", fs.readdirSync(DRIVE));
      console.log("  --- unplug: remove the whole drive folder ---");
      fs.rmSync(path.join(G.root, "ExternalDrive"), { recursive: true, force: true });
      await a.win.waitForTimeout(1500);
      await openPanel(a);
      await a.win.click('button:text-is("Reveal in Finder")');
      await a.win.waitForTimeout(1500);
      console.log("  Reveal says:", await hstatus(a));
      await a.win.click('button:text-is("Export FCPXML")');
      await a.win.waitForTimeout(3500);
      console.log("  Export FCPXML says:", await hstatus(a));
      console.log("  did the app recreate the drive folder?", fs.existsSync(DRIVE), fs.existsSync(DRIVE) ? fs.readdirSync(DRIVE) : "");
      await a.win.click('button:text-is("Copy file path")');
      await a.win.waitForTimeout(600);
      console.log("  Copy file path says:", await hstatus(a));
      console.log("  clipboard:", JSON.stringify(await a.win.evaluate(async () => await navigator.clipboard.readText())));
      console.log("  footer:", await a.win.evaluate(() => document.querySelector("footer")?.innerText.replace(/\n+/g, " | ")));
      console.log("  shot:", await a.shot("drive-unplugged"));
      console.log("  page errors:", JSON.stringify(a.logs.pageErrors));
    } finally { await a.close(); }
  }
  process.exit(0);
})().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
