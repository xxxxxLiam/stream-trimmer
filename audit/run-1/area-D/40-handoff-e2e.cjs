/**
 * Area D / editor handoff end to end, in the real app with real clicks.
 *
 * Cuts two real clips with real ffmpeg, then drives the "Hand off to an
 * editor" panel: library, media event, project event, project name pattern,
 * Export FCPXML, Send all to Final Cut Pro, Copy file path, Reveal, the
 * CapCut drop folder, double-click races, and a library that does not exist.
 *
 * Every .fcpxml the app actually writes is validated against Apple's FCPXML
 * 1.10 DTD with xmllint.
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const { boot, campaign, folders, SCRATCH } = require("./lib-D.cjs");
const { loadVideo, addSegment, cut } = require("./lib-cut.cjs");

const DTD = `${SCRATCH}/FCPXMLv1_10.dtd`;
const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out/handoff";

function xmllint(file) {
  const r = { wf: "ok", dtd: "ok" };
  try { execFileSync("xmllint", ["--noout", file], { stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { r.wf = String(e.stderr || e.message).trim(); }
  try { execFileSync("xmllint", ["--noout", "--dtdvalid", DTD, file], { stdio: ["ignore", "pipe", "pipe"] }); }
  catch (e) { r.dtd = String(e.stderr || e.message).trim(); }
  return r;
}
function xpath(file, q) {
  try { return execFileSync("xmllint", ["--xpath", q, file]).toString().trim(); }
  catch (e) { return "<xpath failed: " + String(e.stderr || e.message).trim().slice(0, 120) + ">"; }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const F = folders("handoff");
  const LIB = path.join(F.root, "Client Library تجربة.fcpbundle");
  fs.mkdirSync(LIB);
  const DROP = path.join(F.root, "CapCut Drop");
  fs.mkdirSync(DROP);
  console.log("clips:", F.clips);
  console.log("library:", LIB);
  console.log("capcut drop:", DROP);

  const a = await boot({
    label: "D-handoff",
    outDir: OUT,
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": F.clips,
      "clipper.dataDir": F.data,
      "clipper.saveDir": F.clips,
      "clipper.campaigns": [campaign("aud", "Audit D", F.clips, F.data)],
      "clipper.activeCampaign": "aud",
    },
  });
  const status = async () =>
    await a.win.evaluate(() => {
      const s = document.querySelector('section[aria-label="Editor handoff"]');
      if (!s) return "<no handoff section>";
      const el = s.querySelector('[role="status"], [role="alert"]');
      return el ? el.innerText.trim() : "<no status shown>";
    });
  const panelText = async () =>
    await a.win.evaluate(
      () => document.querySelector('section[aria-label="Editor handoff"]')?.innerText.replace(/\n+/g, " | ") ?? "",
    );
  const field = (label) =>
    a.win.locator(`section[aria-label="Editor handoff"] label:has(> span:text-is("${label}")) input`).first();

  try {
    // ---------------------------------------------------- cut two real clips
    await loadVideo(a);
    await addSegment(a, 2, 8);
    console.log("cut 1:", JSON.stringify(await cut(a)));
    await addSegment(a, 20, 26);
    console.log("cut 2:", JSON.stringify(await cut(a)));
    console.log("clips folder now:", fs.readdirSync(F.clips));
    console.log(await a.shot("two-clips-cut"));

    // ---------------------------------------------------- open the panel
    await a.win.click('section[aria-label="Editor handoff"] button[aria-expanded]');
    await a.win.waitForTimeout(400);
    console.log("\n=== panel open ===");
    console.log(await panelText());
    console.log(await a.shot("panel-open"));

    // ---------------------------------------------------- A. no clip at all?
    // (covered in 70-state.cjs on a fresh session; here the buttons must be live)
    console.log("\nExport FCPXML disabled?", await a.win.locator('button:text-is("Export FCPXML")').isDisabled());

    // ---------------------------------------------------- B. plain export
    console.log("\n=== B. Export FCPXML, no library, no project ===");
    await a.win.click('button:text-is("Export FCPXML")');
    await a.win.waitForTimeout(2500);
    console.log("status:", await status());
    let written = fs.readdirSync(F.clips).filter((f) => f.endsWith(".fcpxml"));
    console.log("fcpxml in clips folder:", written);
    for (const w of written) {
      const f = path.join(F.clips, w);
      const v = xmllint(f);
      console.log(`  ${w}: well-formed=${v.wf === "ok" ? "OK" : "FAIL " + v.wf}  DTD=${v.dtd === "ok" ? "OK" : "FAIL " + v.dtd}`);
      console.log("  events:", xpath(f, "count(//event)"), " assets:", xpath(f, "count(//asset)"), " asset-clips:", xpath(f, "count(//asset-clip)"));
      console.log("  import-options present:", xpath(f, "count(//import-options)"));
      fs.copyFileSync(f, path.join(OUT, "B-" + w));
    }
    console.log(await a.shot("export-plain"));

    // ---------------------------------------------------- C. library that does not exist
    console.log("\n=== C. a library path that does NOT exist must fail closed ===");
    const missing = path.join(F.root, "Nope.fcpbundle");
    await field("Library").fill(missing);
    await a.win.waitForTimeout(300);
    console.log("inline note:", await a.win.evaluate(() => {
      const s = document.querySelector('section[aria-label="Editor handoff"]');
      return Array.from(s.querySelectorAll("span")).map((e) => e.innerText.trim())
        .filter((t) => /fcpbundle|library|Library/.test(t)).slice(0, 3);
    }));
    const beforeC = fs.readdirSync(F.clips);
    await a.win.click('button:text-is("Send all to Final Cut Pro")');
    await a.win.waitForTimeout(2500);
    console.log("status:", await status());
    console.log("library created on disk by us?", fs.existsSync(missing));
    console.log("new files in clips folder:", fs.readdirSync(F.clips).filter((f) => !beforeC.includes(f)));
    console.log(await a.shot("library-missing"));

    // ---------------------------------------------------- D. relative library
    console.log("\n=== D. a relative library path ===");
    await field("Library").fill("relative/Thing.fcpbundle");
    await a.win.waitForTimeout(300);
    console.log("inline note:", await a.win.evaluate(() => {
      const s = document.querySelector('section[aria-label="Editor handoff"]');
      return Array.from(s.querySelectorAll('[role="alert"], span')).map((e) => e.innerText.trim())
        .filter((t) => /full path|starting with/.test(t));
    }));
    await a.win.click('button:text-is("Send all to Final Cut Pro")');
    await a.win.waitForTimeout(2000);
    console.log("status:", await status());

    // ------------------------------------- E. library + media event + project event
    console.log("\n=== E. library + named event + project in a SECOND event ===");
    await field("Library").fill(LIB);
    await field("Event for the raw clip").fill("Raw clips تجربة");
    await a.win.click('section[aria-label="Editor handoff"] input[type="checkbox"] >> nth=0');
    await a.win.waitForTimeout(400);
    await field("Event for the projects").fill("Projects & <timelines>");
    await field("Project name").fill("{clipId} - {label} - {campaign}");
    await a.win.waitForTimeout(300);
    console.log("panel:", (await panelText()).slice(0, 1400));
    console.log(await a.shot("full-settings"));

    const beforeE = fs.readdirSync(F.clips);
    await a.win.click('button:text-is("Send all to Final Cut Pro")');
    await a.win.waitForTimeout(3500);
    console.log("status:", await status());
    const newE = fs.readdirSync(F.clips).filter((f) => !beforeE.includes(f));
    console.log("new files:", newE);
    for (const w of fs.readdirSync(F.clips).filter((f) => f.endsWith(".fcpxml"))) {
      const f = path.join(F.clips, w);
      const v = xmllint(f);
      console.log(`\n  --- ${w}`);
      console.log(`  well-formed=${v.wf === "ok" ? "OK" : "FAIL " + v.wf}   DTD 1.10=${v.dtd === "ok" ? "OK" : "FAIL " + v.dtd}`);
      console.log("  import-options option value:", xpath(f, 'string(//import-options/option[@key="library location"]/@value)'));
      console.log("  <library location> attribute (the old bug, must be absent):", xpath(f, "count(//library)"));
      console.log("  events:", xpath(f, "count(//event)"));
      console.log("  event 1 name:", xpath(f, "string(//event[1]/@name)"));
      console.log("  event 2 name:", xpath(f, "string(//event[2]/@name)"));
      console.log("  asset-clips in event 1:", xpath(f, "count(//event[1]/asset-clip)"));
      console.log("  projects in event 2:", xpath(f, "count(//event[2]/project)"));
      console.log("  project names:", xpath(f, "string(//event[2]/project[1]/@name)"), "|", xpath(f, "string(//event[2]/project[2]/@name)"));
      console.log("  sequence formats:", xpath(f, "string(//event[2]/project[1]/sequence/@format)"));
      console.log("  spine asset-clip ref:", xpath(f, "string(//event[2]/project[1]/sequence/spine/asset-clip/@ref)"));
      fs.copyFileSync(f, path.join(OUT, "E-" + w));
    }
    console.log(await a.shot("sent-full"));

    // ---------------------------------------------------- F. double-click Send
    console.log("\n=== F. double-click Send all (race) ===");
    const beforeF = fs.readdirSync(F.clips);
    await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) => x.textContent.trim() === "Send all to Final Cut Pro");
      b.click(); b.click(); b.click();
    });
    await a.win.waitForTimeout(4000);
    console.log("status:", await status());
    console.log("files added by the triple click:", fs.readdirSync(F.clips).filter((f) => !beforeF.includes(f)));
    console.log("total .fcpxml files now:", fs.readdirSync(F.clips).filter((f) => f.endsWith(".fcpxml")));
    console.log(await a.shot("double-send"));

    // ---------------------------------------------------- G. Copy file path
    console.log("\n=== G. Copy file path ===");
    await a.win.click('button:text-is("Copy file path")');
    await a.win.waitForTimeout(700);
    console.log("status:", await status());
    const clip = await a.win.evaluate(async () => await navigator.clipboard.readText());
    console.log("clipboard:", JSON.stringify(clip));
    console.log("every path on the clipboard exists on disk:",
      clip.split("\n").every((p) => p && fs.existsSync(p)) );

    // ---------------------------------------------------- H. Reveal in Finder
    console.log("\n=== H. Reveal in Finder (clips folder) ===");
    await a.win.click('button:text-is("Reveal in Finder")');
    await a.win.waitForTimeout(1200);
    console.log("status:", await status());

    // ---------------------------------------------------- I. CapCut
    console.log("\n=== I. CapCut: Reveal drop folder / Open CapCut ===");
    console.log("Reveal drop folder disabled with no folder set:",
      await a.win.locator('button:text-is("Reveal drop folder")').isDisabled());
    await a.win.click('button:text-is("Open CapCut")');
    await a.win.waitForTimeout(1500);
    console.log("Open CapCut status:", await status());
    console.log(await a.shot("capcut"));

    // ---------------------------------------------------- J. after-cutting = Send to FCP
    console.log("\n=== J. 'After cutting: Send to Final Cut Pro' then cut another clip ===");
    await a.win.selectOption('section[aria-label="Editor handoff"] select >> nth=0', "finalcut");
    await a.win.waitForTimeout(400);
    const beforeJ = fs.readdirSync(F.clips);
    await addSegment(a, 40, 46);
    const cutJ = await cut(a);
    console.log("cut:", JSON.stringify(cutJ));
    await a.win.waitForTimeout(3500);
    console.log("status:", await status());
    console.log("files added:", fs.readdirSync(F.clips).filter((f) => !beforeJ.includes(f)));
    console.log(await a.shot("after-cutting-finalcut"));
    const fcp = fs.readdirSync(F.clips).filter((f) => f.endsWith(".fcpxml"));
    for (const w of fcp) {
      const f = path.join(F.clips, w);
      const v = xmllint(f);
      console.log(`  ${w}: wf=${v.wf === "ok" ? "OK" : "FAIL"} dtd=${v.dtd === "ok" ? "OK" : "FAIL " + v.dtd}  clips=${xpath(f, "count(//asset)")} projects=${xpath(f, "count(//project)")}`);
      fs.copyFileSync(f, path.join(OUT, "J-" + w));
    }

    // ---------------------------------------------------- K. settings persisted?
    console.log("\n=== K. what persisted ===");
    const st = a.readState();
    console.log(JSON.stringify(st["clipper.editorHandoff"], null, 1));

    console.log("\n--- page errors ---", JSON.stringify(a.logs.pageErrors));
    console.log("--- console errors ---", JSON.stringify(a.logs.console.filter((l) => /\[error\]/.test(l)).slice(0, 10), null, 1));
  } finally {
    try { fs.writeFileSync(path.join(OUT, "clips-dir-listing.txt"), fs.readdirSync(F.clips).join("\n")); } catch {}
    await a.close();
  }
  process.exit(0);
})().catch((e) => { console.error("SCRIPT FAILED:", e); process.exit(1); });
