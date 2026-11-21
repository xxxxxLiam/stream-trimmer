/**
 * Area D / story 3 retried with three clips, plus a check on why the earlier
 * attempt was blocked.
 *
 * The first attempt cut 00:00:02-00:00:08 and was then refused for
 * 00:02:00-00:02:06 as "Already used", which should not overlap. This records
 * what the campaign actually stored, then uses ranges that cannot collide
 * under either reading so the three-clip send can be exercised.
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { boot, campaign, folders, SCRATCH } = require("./lib-D.cjs");
const { loadVideo, addSegment, cut } = require("./lib-cut.cjs");

const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out/three";
const DTD = `${SCRATCH}/FCPXMLv1_10.dtd`;
const xp = (f, q) => { try { return execFileSync("xmllint", ["--xpath", q, f]).toString().trim(); } catch { return "<none>"; } };

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const F = folders("three");
  const LIB = path.join(F.root, "Studio.fcpbundle");
  fs.mkdirSync(LIB);
  const a = await boot({
    label: "D-three", outDir: OUT,
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": F.clips, "clipper.dataDir": F.data, "clipper.saveDir": F.clips,
      "clipper.campaigns": [campaign("aud", "Ramadan Reels", F.clips, F.data)],
      "clipper.activeCampaign": "aud",
      "clipper.editorHandoff": { aud: {
        afterCutting: "nothing", eventName: "campaign", capcutDropDir: "", openCapCut: false,
        fcpLibrary: LIB, mediaEvent: "Raw", projectEvent: "Edits", createProject: true,
        projectNamePattern: "{clipId} {label}", timelineFormat: { kind: "vertical", width: 1080, height: 1920, fps: "30" } } },
    },
  });
  try {
    await loadVideo(a);

    console.log("=== what the campaign records after ONE cut of 00:00:02 to 00:00:08 ===");
    await addSegment(a, 2, 8);
    console.log("cut:", JSON.stringify(await cut(a)).slice(0, 160));
    const used = a.readState()["clipper.campaigns"]?.[0]?.usedRanges;
    console.log("usedRanges stored:", JSON.stringify(used));
    console.log("(the cut was 2s to 8s; anything else here is a unit error, and it belongs to");
    console.log(" the used-ranges feature in area B/C, not to area D)");
    const warn = await a.win.evaluate(async () => {
      // Ask the live UI about a range that must not overlap 2s-8s.
      const setv = (id, v) => {
        const el = document.querySelector(id);
        const d = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
        d.set.call(el, v);
        el.dispatchEvent(new Event("input", { bubbles: true }));
      };
      setv("#ui-mark-in", "00:02:00");
      setv("#ui-mark-out", "00:02:06");
      await new Promise((r) => setTimeout(r, 600));
      return {
        overlap: document.querySelector("#ui-overlap-warning")?.innerText.replace(/\n+/g, " | ") ?? null,
        cutTitle: document.querySelector("#ui-cut")?.getAttribute("title"),
        addDisabled: document.querySelector("#ui-add-segment")?.disabled,
      };
    });
    console.log("marking 00:02:00 to 00:02:06 gives:", JSON.stringify(warn, null, 1));
    console.log(await a.shot("overlap-warning"));

    console.log("\n=== three clips with ranges that cannot collide under either reading ===");
    for (const [from, to] of [[11, 17], [21, 27]]) {
      await addSegment(a, from, to);
      console.log(`  cut ${from}-${to}: ${JSON.stringify(await cut(a)).slice(0, 200)}`);
    }
    console.log("  clips on disk:", fs.readdirSync(F.clips));

    const e = await a.win.locator('section[aria-label="Editor handoff"] button[aria-expanded]').getAttribute("aria-expanded");
    if (e !== "true") await a.win.click('section[aria-label="Editor handoff"] button[aria-expanded]');
    await a.win.waitForTimeout(400);
    console.log("  panel note:", await a.win.evaluate(() =>
      Array.from(document.querySelectorAll('section[aria-label="Editor handoff"] p')).map((p) => p.innerText.trim()).find((t) => /Send all/.test(t))));
    await a.win.click('button:text-is("Send all to Final Cut Pro")');
    await a.win.waitForTimeout(4500);
    console.log("  status:", await a.win.evaluate(() => {
      const s = document.querySelector('section[aria-label="Editor handoff"]');
      const el = s.querySelector('[role="status"], [role="alert"]');
      return el ? el.innerText.trim() : "<none>";
    }));
    for (const d of fs.readdirSync(F.clips).filter((f) => f.endsWith(".fcpxml"))) {
      const f = path.join(F.clips, d);
      fs.copyFileSync(f, path.join(OUT, d));
      let dtd = "OK";
      try { execFileSync("xmllint", ["--noout", "--dtdvalid", DTD, f], { stdio: ["ignore", "pipe", "pipe"] }); }
      catch (err) { dtd = "FAIL " + String(err.stderr).trim(); }
      console.log(`  ${d}: DTD=${dtd}`);
      console.log(`    events=${xp(f, "count(//event)")} assets=${xp(f, "count(//asset)")} media-event asset-clips=${xp(f, "count(//event[1]/asset-clip)")} projects=${xp(f, "count(//event[2]/project)")}`);
      console.log(`    event names: ${xp(f, "string(//event[1]/@name)")} | ${xp(f, "string(//event[2]/@name)")}`);
      console.log(`    project names: ${[1, 2, 3].map((i) => xp(f, `string(//event[2]/project[${i}]/@name)`)).join(" , ")}`);
      console.log(`    each project's spine ref: ${[1, 2, 3].map((i) => xp(f, `string(//event[2]/project[${i}]/sequence/spine/asset-clip/@ref)`)).join(" , ")}`);
      console.log(`    library option: ${xp(f, 'string(//import-options/option/@value)')}`);
    }
    console.log("  shot:", await a.shot("three-clips-sent"));
    console.log("--- page errors ---", JSON.stringify(a.logs.pageErrors));
  } finally { await a.close(); }
  process.exit(0);
})().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
