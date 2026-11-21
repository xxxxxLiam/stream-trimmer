/**
 * Area D / FCPXML generation and DTD validation.
 *
 * Runs the product's own src/lib/fcpxml.ts (compiled unchanged with the repo's
 * esbuild, no reimplementation) over the required matrix, using REAL ffprobe
 * output from REAL media files, then validates every document against Apple's
 * FCPXML 1.10 DTD with xmllint --dtdvalid, which checks element ORDER against
 * the content model as well as well-formedness.
 *
 * Changes no product code.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const DTD = `${SCRATCH}/FCPXMLv1_10.dtd`;
const MEDIA = `${SCRATCH}/Dmedia`;
const OUT = `${REPO}/audit/run-1/area-D/out/fcpxml`;

fs.mkdirSync(OUT, { recursive: true });

// --- compile the product module, unchanged -------------------------------
const bundle = path.join(OUT, "_fcpxml.bundle.cjs");
execFileSync(
  path.join(REPO, "node_modules", ".bin", "esbuild"),
  [path.join(REPO, "src", "lib", "fcpxml.ts"), "--bundle", "--platform=node", "--format=cjs", `--outfile=${bundle}`],
  { stdio: "inherit" },
);
const F = require(bundle);

// --- real probes ---------------------------------------------------------
function ffprobe(file) {
  const out = execFileSync("ffprobe", [
    "-v", "error", "-print_format", "json", "-show_streams", "-show_format", file,
  ], { maxBuffer: 16 * 1024 * 1024 }).toString();
  return { kind: "ffprobe", json: JSON.parse(out) };
}
const probe = async (file) => ffprobe(file);

const results = [];

function validate(name, xml) {
  const file = path.join(OUT, name.replace(/[^A-Za-z0-9._-]+/g, "_") + ".fcpxml");
  fs.writeFileSync(file, xml);
  let wf = "ok";
  let dtd = "ok";
  try {
    execFileSync("xmllint", ["--noout", file], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    wf = String(e.stderr || e.message).trim();
  }
  try {
    execFileSync("xmllint", ["--noout", "--dtdvalid", DTD, file], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e) {
    dtd = String(e.stderr || e.message).trim();
  }
  results.push({ name, file, wellFormed: wf, dtdValid: dtd });
  console.log(`\n### ${name}`);
  console.log(`  file: ${file}`);
  console.log(`  well-formed: ${wf === "ok" ? "OK" : "FAIL\n" + wf}`);
  console.log(`  DTD 1.10:    ${dtd === "ok" ? "OK" : "FAIL\n" + dtd}`);
  return file;
}

function err(name, fn) {
  try {
    const xml = fn();
    console.log(`\n### ${name}\n  built (no throw)`);
    return validate(name, xml);
  } catch (e) {
    console.log(`\n### ${name}\n  THREW: ${e.message}`);
    results.push({ name, threw: e.message });
    return null;
  }
}

(async () => {
  const seg = (start, end) => ({ start, end });

  // ------------------------------------------------------------------ 1
  await (async () => {
    const r = await F.buildSessionFcpxml(
      [{ id: "M-abc-01", label: "one segment", path: `${MEDIA}/clip30.mp4`, segments: [seg(10, 20)], sourceUrl: "https://www.youtube.com/watch?v=stub0000001" }],
      "My Event", probe, {});
    validate("01-one-segment", r.xml);
  })();

  // ------------------------------------------------------------------ 2
  await (async () => {
    const r = await F.buildSessionFcpxml(
      [{ id: "M-abc-02", label: "three segments", path: `${MEDIA}/clip30.mp4`, segments: [seg(1, 2), seg(5, 7.5), seg(20, 29)] }],
      "My Event", probe, {});
    validate("02-several-segments", r.xml);
  })();

  // ------------------------------------------------------------------ 2b several clips, mixed formats
  await (async () => {
    const r = await F.buildSessionFcpxml(
      [
        { id: "M-abc-03", path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 5)] },
        { id: "M-abc-04", path: `${MEDIA}/ntsc.mp4`, segments: [seg(0, 3)] },
      ],
      "Mixed", probe, {
        project: { eventName: "Projects", namePattern: "{clipId} {label}", timeline: F.DEFAULT_TIMELINE },
      });
    console.log("  projectNames:", JSON.stringify(r.projectNames));
    validate("02b-two-clips-ntsc-plus-25fps-with-projects", r.xml);
  })();

  // ------------------------------------------------------------------ 3 zero-length
  await (async () => {
    try {
      const r = await F.buildSessionFcpxml(
        [{ id: "M-zero-01", path: `${MEDIA}/tiny.mp4`, segments: [seg(0, 0)] }],
        "Zero", probe, {});
      console.log("\n### 03-zero-length-media-event-only\n  built (no throw)");
      validate("03-zero-length-media-only", r.xml);
    } catch (e) {
      console.log(`\n### 03-zero-length-media-event-only\n  THREW: ${e.message}`);
      results.push({ name: "03-zero-length-media-only", threw: e.message });
    }
    try {
      const r = await F.buildSessionFcpxml(
        [{ id: "M-zero-01", path: `${MEDIA}/tiny.mp4`, segments: [seg(0, 0)] }],
        "Zero", probe, { project: { eventName: "Projects", namePattern: "{clipId}", timeline: F.DEFAULT_TIMELINE } });
      console.log("\n### 03b-zero-length-with-project\n  built (no throw)");
      validate("03b-zero-length-with-project", r.xml);
    } catch (e) {
      console.log(`\n### 03b-zero-length-with-project\n  THREW: ${e.message}`);
      results.push({ name: "03b-zero-length-with-project", threw: e.message });
    }
    // empty file and audio-only file: the two realistic "nothing to cut" cases
    for (const [nm, f] of [["03c-empty-file", "empty.mp4"], ["03d-audio-only", "audioonly.m4a"]]) {
      try {
        const r = await F.buildSessionFcpxml(
          [{ id: "M-bad-01", path: `${MEDIA}/${f}`, segments: [seg(0, 1)] }], "Bad", probe, {});
        validate(nm, r.xml);
      } catch (e) {
        console.log(`\n### ${nm}\n  THREW: ${e.message}`);
        results.push({ name: nm, threw: e.message });
      }
    }
    // one good clip + one unprobeable clip: the good one must survive
    try {
      const r = await F.buildSessionFcpxml(
        [
          { id: "M-good-01", path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 2)] },
          { id: "M-bad-02", path: `${MEDIA}/empty.mp4`, segments: [seg(0, 2)] },
        ], "Partial", probe, {});
      console.log("  skipped:", JSON.stringify(r.skipped));
      validate("03e-one-good-one-unprobeable", r.xml);
    } catch (e) {
      console.log(`\n### 03e\n  THREW: ${e.message}`);
    }
  })();

  // ------------------------------------------------------------------ 4 hostile clip name
  await (async () => {
    const nasty = `& < > " ' \u{1F600} tail\nsecond line`;
    const r = await F.buildSessionFcpxml(
      [{ id: "M-nasty-01", label: nasty, path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 3)], sourceUrl: `https://x/?a=1&b=<2>` }],
      `Ev ${nasty}`, probe, {
        project: { eventName: `Proj ${nasty}`, namePattern: "{clipId} {label}", timeline: F.DEFAULT_TIMELINE },
      });
    console.log("  filename:", JSON.stringify(r.filename));
    console.log("  projectNames:", JSON.stringify(r.projectNames));
    const file = validate("04-nasty-clip-name", r.xml);
    // Round-trip: does the name survive as the exact text (minus the XML
    // newline-in-attribute normalisation the generator deliberately applies)?
    const got = execFileSync("xmllint", ["--xpath", "string(//asset/@name)", file]).toString();
    console.log("  asset/@name round-trips as:", JSON.stringify(got));
    const note = execFileSync("xmllint", ["--xpath", "string(//event/asset-clip/note)", file]).toString();
    console.log("  note round-trips as:", JSON.stringify(note));
  })();

  // ------------------------------------------------------------------ 5 library paths
  const libs = [
    ["05a-spaces-unicode", `${MEDIA}/My Library تجربة \u{1F600}.fcpbundle`],
    ["05b-trailing-slash", `${MEDIA}/Trail.fcpbundle/`],
    ["05c-dotdot", `${MEDIA}/sub/../Dots.fcpbundle`],
    ["05d-newline-in-path", `${MEDIA}/New\nLine.fcpbundle`],
    ["05e-300-char", "/" + "d".repeat(300) + ".fcpbundle"],
    ["05f-relative", "relative/Lib.fcpbundle"],
    ["05g-file-url", `file://${MEDIA}/Url.fcpbundle`],
    ["05h-is-a-file-not-a-dir", `${MEDIA}/clip30.mp4`],
    ["05i-does-not-exist", `${MEDIA}/Missing.fcpbundle`],
    ["05j-symlink", `${MEDIA}/LinkTo.fcpbundle`],
  ];
  // real on-disk shapes for the ones that must exist
  fs.mkdirSync(`${MEDIA}/My Library تجربة \u{1F600}.fcpbundle`, { recursive: true });
  fs.mkdirSync(`${MEDIA}/Trail.fcpbundle`, { recursive: true });
  fs.mkdirSync(`${MEDIA}/Dots.fcpbundle`, { recursive: true });
  fs.mkdirSync(`${MEDIA}/New\nLine.fcpbundle`, { recursive: true });
  fs.mkdirSync(`${MEDIA}/Url.fcpbundle`, { recursive: true });
  fs.mkdirSync(`${MEDIA}/RealTarget.fcpbundle`, { recursive: true });
  try { fs.symlinkSync(`${MEDIA}/RealTarget.fcpbundle`, `${MEDIA}/LinkTo.fcpbundle`); } catch { /* exists */ }

  // libraryExists mirrors electron/editorOpen.cjs pathExists(): absolute path,
  // statSync, isDirectory.
  const libraryExists = async (local) => {
    if (!path.isAbsolute(local)) return false;
    try { return fs.statSync(local).isDirectory(); } catch { return false; }
  };

  console.log("\n================ LIBRARY PATHS ================");
  for (const [name, lib] of libs) {
    let loc = null;
    let locErr = null;
    try { loc = F.libraryLocation(lib); } catch (e) { locErr = e.message; }
    let lp = null;
    try { lp = F.libraryPath(lib); } catch (e) { lp = "THREW: " + e.message; }
    console.log(`\n### ${name}`);
    console.log(`  input:            ${JSON.stringify(lib)}`);
    console.log(`  libraryLocation:  ${locErr ? "THREW " + locErr : JSON.stringify(loc)}`);
    console.log(`  libraryPath:      ${JSON.stringify(lp)}`);
    console.log(`  exists as dir:    ${await libraryExists(lp)}`);
    try {
      const r = await F.buildSessionFcpxml(
        [{ id: "M-lib-01", path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 2)] }],
        "LibEvent", probe, { library: lib, libraryExists });
      console.log("  buildSessionFcpxml: BUILT");
      const f = validate(name, r.xml);
      const opt = execFileSync("xmllint", ["--xpath", 'string(//import-options/option[@key="library location"]/@value)', f]).toString();
      console.log(`  option value:     ${JSON.stringify(opt)}`);
      results[results.length - 1].optionValue = opt;
    } catch (e) {
      console.log(`  buildSessionFcpxml: REFUSED -> ${e.message}`);
      results.push({ name, refused: e.message });
    }
  }
  // no libraryExists callback at all (the web/no-bridge case)
  try {
    await F.buildSessionFcpxml(
      [{ id: "M-lib-02", path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 2)] }],
      "LibEvent", probe, { library: `${MEDIA}/Trail.fcpbundle` });
    console.log("\n### 05k-no-libraryExists-callback\n  BUILT (library unchecked)");
    results.push({ name: "05k-no-libraryExists-callback", note: "BUILT without a check" });
  } catch (e) {
    console.log(`\n### 05k-no-libraryExists-callback\n  REFUSED -> ${e.message}`);
    results.push({ name: "05k-no-libraryExists-callback", refused: e.message });
  }

  // ------------------------------------------------------------------ 6 event names
  console.log("\n================ EVENT NAMES ================");
  const events = [
    ["06a-empty", ""],
    ["06b-whitespace-only", "   \t  "],
    ["06c-500-chars", "E".repeat(500)],
    ["06d-reserved-chars", 'a/b\\c:d*e?f"g<h>i|j'],
    ["06e-newline", "line one\nline two"],
    ["06f-xml-metachars", `& < > " '`],
    ["06g-emoji-rtl", "\u{1F600} تجربة ‮override"],
    ["06h-dots", "..."],
    ["06i-just-dots-traversal", "../../escape"],
    ["06j-control-chars", "a\u0000b\u0007c\u001Fd"],
  ];
  for (const [name, ev] of events) {
    try {
      const r = await F.buildSessionFcpxml(
        [{ id: "M-ev-01", path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 2)] }],
        ev, probe, { project: { eventName: ev, namePattern: "{clipId}", timeline: F.DEFAULT_TIMELINE } });
      console.log(`\n### ${name}`);
      console.log(`  input:    ${JSON.stringify(ev)}`);
      console.log(`  filename: ${JSON.stringify(r.filename)}`);
      const f = validate(name, r.xml);
      const got = execFileSync("xmllint", ["--xpath", "string(//event/@name)", f]).toString();
      console.log(`  event/@name: ${JSON.stringify(got)}`);
      const nEvents = execFileSync("xmllint", ["--xpath", "count(//event)", f]).toString();
      console.log(`  event count: ${nEvents}`);
      results[results.length - 1].filename = r.filename;
      results[results.length - 1].eventName = got;
      results[results.length - 1].eventCount = nEvents;
    } catch (e) {
      console.log(`\n### ${name}\n  input: ${JSON.stringify(ev)}\n  THREW: ${e.message}`);
      results.push({ name, threw: e.message });
    }
  }

  // ---------------------------------------------- 7 project in a SECOND event
  console.log("\n================ LIBRARY + EVENT + PROJECT IN A SECOND EVENT ================");
  await (async () => {
    const r = await F.buildSessionFcpxml(
      [
        { id: "M-full-01", label: "first", path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 4)] },
        { id: "M-full-02", label: "second", path: `${MEDIA}/ntsc.mp4`, segments: [seg(0, 2)] },
      ],
      "Raw clips", probe, {
        library: `${MEDIA}/Trail.fcpbundle`,
        libraryExists,
        project: { eventName: "Projects", namePattern: "{clipId} {label}", timeline: F.DEFAULT_TIMELINE, campaignName: "Campaign X" },
      });
    const f = validate("07-library-event-project-second-event", r.xml);
    const q = (x) => execFileSync("xmllint", ["--xpath", x, f]).toString();
    console.log("  events:              ", q("count(//event)"));
    console.log("  event names:         ", q("string(//event[1]/@name)"), "|", q("string(//event[2]/@name)"));
    console.log("  asset-clips in ev1:  ", q("count(//event[1]/asset-clip)"));
    console.log("  projects in ev1:     ", q("count(//event[1]/project)"));
    console.log("  projects in ev2:     ", q("count(//event[2]/project)"));
    console.log("  library option:      ", q('string(//import-options/option[@key="library location"]/@value)'));
    console.log("  project names:       ", JSON.stringify(r.projectNames));
    console.log("\n--- document ---\n" + fs.readFileSync(f, "utf8"));
  })();

  // same name for both events: documented as merged
  await (async () => {
    const r = await F.buildSessionFcpxml(
      [{ id: "M-merge-01", path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 2)] }],
      "Same", probe, { project: { eventName: "Same", namePattern: "{clipId}", timeline: F.DEFAULT_TIMELINE } });
    const f = validate("07b-same-event-name-merged", r.xml);
    console.log("  events:", execFileSync("xmllint", ["--xpath", "count(//event)", f]).toString());
  })();

  // repeated project names
  await (async () => {
    const r = await F.buildSessionFcpxml(
      [
        { id: "A", path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 2)] },
        { id: "B", path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 2)] },
        { id: "C", path: `${MEDIA}/clip30.mp4`, segments: [seg(0, 2)] },
      ],
      "Dup", probe, { project: { eventName: "Projects", namePattern: "Fixed name", timeline: F.DEFAULT_TIMELINE } });
    console.log("\n### 07c-duplicate-project-names\n  projectNames:", JSON.stringify(r.projectNames));
    validate("07c-duplicate-project-names", r.xml);
  })();

  // ------------------------------------------------------------------ 8 empty input
  err("08-no-clips", () => F.buildFcpxml({ eventName: "E", clips: [] }));

  fs.writeFileSync(path.join(OUT, "matrix-results.json"), JSON.stringify(results, null, 2));
  console.log("\n================ SUMMARY ================");
  const bad = results.filter((r) => (r.wellFormed && r.wellFormed !== "ok") || (r.dtdValid && r.dtdValid !== "ok"));
  console.log(`documents validated: ${results.filter((r) => r.wellFormed).length}`);
  console.log(`invalid documents:   ${bad.length}`);
  for (const b of bad) console.log(`  ${b.name}: wf=${b.wellFormed === "ok" ? "ok" : "FAIL"} dtd=${b.dtdValid === "ok" ? "ok" : "FAIL"}`);
  console.log("results:", path.join(OUT, "matrix-results.json"));
})().catch((e) => {
  console.error("SCRIPT FAILED:", e);
  process.exit(1);
});
