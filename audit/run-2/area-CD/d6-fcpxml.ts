/**
 * d6-fcpxml.ts — D-9 and the FCPXML work that HELD in run 1, re-checked after
 * D-5's change.
 *
 * `src/lib/fcpxml.ts` is imported UNCHANGED and driven with REAL media made by
 * real ffmpeg and probed with the real `ffprobe` invocation
 * `electron/editorOpen.cjs: probeMedia` uses. No logic is reimplemented.
 * Every document produced is checked for well-formedness and validated against
 * Apple's real FCPXML 1.10 DTD with `xmllint --dtdvalid`, which also enforces
 * element order through its content models.
 *
 * node_modules/.bin/tsx audit/run-2/area-CD/d6-fcpxml.ts
 */
import { execFile, execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { buildSessionFcpxml, type RawProbe, type SessionClip } from "../../../src/lib/fcpxml";

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad/run2CD";
const ROOT = path.join(SCRATCH, "d6");
const DTD = path.join(SCRATCH, "FCPXMLv1_10.dtd");
const HERE = "/home/user/stream-trimmer/audit/run-2/area-CD";
const OUT = path.join(HERE, "out", "d6");
const lines: string[] = [];
function say(...parts: unknown[]) {
  const s = parts.map((p) => (typeof p === "string" ? p : JSON.stringify(p))).join(" ");
  lines.push(s);
  console.log(s);
}
let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail = "") {
  ok ? pass++ : fail++;
  say(`   ${ok ? "ok  " : "FAIL"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function probe(file: string): Promise<RawProbe> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file],
      { maxBuffer: 8 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`ffprobe could not read ${path.basename(file)}: ${String(stderr || err.message).trim()}`));
        resolve({ kind: "ffprobe", json: JSON.parse(stdout) });
      },
    );
  });
}

function validate(file: string) {
  let wf = "ok";
  let dtd = "ok";
  try {
    execFileSync("xmllint", ["--noout", file], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e: any) {
    wf = String(e.stderr || e.message).slice(0, 300);
  }
  try {
    execFileSync("xmllint", ["--noout", "--dtdvalid", DTD, file], { stdio: ["ignore", "pipe", "pipe"] });
  } catch (e: any) {
    dtd = String(e.stderr || e.message).slice(0, 400);
  }
  return { wellFormed: wf, dtd };
}
function count(file: string, expr: string) {
  try {
    return execFileSync("xmllint", ["--xpath", `count(${expr})`, file], { stdio: ["ignore", "pipe", "pipe"] })
      .toString()
      .trim();
  } catch {
    return "err";
  }
}

const ff = (args: string[]) => execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...args], { stdio: "ignore" });

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  fs.mkdirSync(ROOT, { recursive: true });
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  // ---------------------------------------------------------------- real media
  const fixture = path.join("/home/user/stream-trimmer", "audit", "fixtures", "fixture.mp4");
  const good25 = path.join(ROOT, "good-25fps.mp4");
  const good30 = path.join(ROOT, "good-2997fps.mp4");
  const sub1000 = path.join(ROOT, "subframe-1000fps.mp4");
  const sub60 = path.join(ROOT, "one-frame-60fps.mp4");
  const broken = path.join(ROOT, "broken.mp4");
  ff(["-ss", "0", "-t", "3", "-i", fixture, "-c", "copy", good25]);
  ff(["-ss", "4", "-t", "3", "-i", fixture, "-r", "30000/1001", "-c:v", "libx264", "-c:a", "aac", good30]);
  ff(["-f", "lavfi", "-i", "color=c=black:s=320x240:r=1000:d=0.001", "-c:v", "libx264", sub1000]);
  ff(["-f", "lavfi", "-i", "color=c=black:s=320x240:r=60:d=0.0333", "-c:v", "libx264", sub60]);
  fs.writeFileSync(broken, "");
  const dur = (f: string) =>
    execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f]).toString().trim();
  say("real media made with ffmpeg:");
  for (const f of [good25, good30, sub1000, sub60]) say(`   ${path.basename(f)} duration=${dur(f)}`);
  say(`   ${path.basename(broken)} is 0 bytes`);

  const clip = (id: string, file: string, segs = [{ start: 0, end: 3 }], extra: Partial<SessionClip> = {}): SessionClip => ({
    id,
    path: file,
    segments: segs,
    label: extra.label,
    sourceUrl: "https://www.youtube.com/watch?v=stub0000001",
    ...extra,
  });

  const library = path.join(ROOT, "Client Library تجربة.fcpbundle");
  fs.mkdirSync(library, { recursive: true });
  const linkedLib = path.join(ROOT, "LinkToLibrary.fcpbundle");
  try {
    fs.symlinkSync(library, linkedLib);
  } catch {}
  const libExists = async (p: string) => fs.existsSync(p) && fs.statSync(p).isDirectory();

  const project30 = {
    eventName: "Projects event",
    namePattern: "{clipId} - {campaign}",
    timeline: { kind: "vertical" as const, width: 1080, height: 1920, fps: "30" },
    campaignName: "Audit CD",
    sourceTitle: "Stub video",
  };

  async function run(name: string, clips: SessionClip[], opts: any) {
    try {
      const r = await buildSessionFcpxml(clips, opts.eventName ?? "Raw clips", probe, {
        library: opts.library,
        libraryExists: libExists,
        project: opts.project,
      });
      const file = path.join(OUT, `${name.replace(/[^\w.-]+/g, "_")}.fcpxml`);
      fs.writeFileSync(file, r.xml);
      const v = validate(file);
      return {
        ok: true as const,
        file,
        included: r.included,
        skipped: r.skipped,
        filename: r.filename,
        projectNames: r.projectNames,
        libraryElements: count(file, "//library"),
        importOption: count(file, '//import-options/option[@key="library location"]'),
        events: count(file, "//event"),
        projects: count(file, "//project"),
        assets: count(file, "//asset"),
        ...v,
      };
    } catch (err: any) {
      return { ok: false as const, threw: String(err && err.message ? err.message : err) };
    }
  }

  // ================================================== D-9
  say("");
  say("================ D-9 — one unusable clip must not take the batch down");
  const cases: [string, SessionClip[], any][] = [
    ["A unprobeable + 3 good, project ON", [clip("M-G1", good25), clip("M-BROKEN", broken), clip("M-G2", good30), clip("M-G3", good25)], { library, project: project30 }],
    ["B subframe 1000fps + 3 good, project ON", [clip("M-G1", good25), clip("M-SUBFRAME", sub1000, [{ start: 0, end: 0.001 }]), clip("M-G2", good30), clip("M-G3", good25)], { library, project: project30 }],
    ["C the same subframe clip, project OFF", [clip("M-G1", good25), clip("M-SUBFRAME", sub1000, [{ start: 0, end: 0.001 }]), clip("M-G2", good30)], { library }],
    ["D one frame of 60fps + 2 good, project ON", [clip("M-G1", good25), clip("M-60FPS", sub60, [{ start: 0, end: 0.0333 }]), clip("M-G2", good30)], { library, project: project30 }],
    ["E subframe with a match-source timeline", [clip("M-G1", good25), clip("M-SUBFRAME", sub1000, [{ start: 0, end: 0.001 }])], { library, project: { ...project30, timeline: { kind: "source" as const, width: 1080, height: 1920, fps: "source" } } }],
    ["F EVERY clip unusable, project ON", [clip("M-SUBFRAME", sub1000, [{ start: 0, end: 0.001 }]), clip("M-BROKEN", broken)], { library, project: project30 }],
    ["G a missing file among good ones", [clip("M-G1", good25), clip("M-GONE", path.join(ROOT, "not-there.mp4")), clip("M-G2", good30)], { library, project: project30 }],
    ["H two clips with the SAME id", [clip("M-SAME", good25), clip("M-SAME", good30)], { library, project: project30 }],
    ["I two clips pointing at the SAME file", [clip("M-A", good25), clip("M-B", good25)], { library, project: project30 }],
  ];
  for (const [name, clips, opts] of cases) {
    const r = await run(name, clips, opts);
    say(`  ${name}`);
    say(`      ${JSON.stringify(r)}`);
  }
  const A = await run("verdict-A", [clip("M-G1", good25), clip("M-BROKEN", broken), clip("M-G2", good30)], { library, project: project30 });
  const B = await run("verdict-B", [clip("M-G1", good25), clip("M-SUBFRAME", sub1000, [{ start: 0, end: 0.001 }]), clip("M-G2", good30)], { library, project: project30 });
  const D = await run("verdict-D", [clip("M-G1", good25), clip("M-60FPS", sub60, [{ start: 0, end: 0.0333 }]), clip("M-G2", good30)], { library, project: project30 });
  check("D-9 case A still exports the good clips", A.ok === true && A.included === 2);
  check("D-9 case B no longer throws", B.ok === true, B.ok ? `included ${B.included}, skipped ${JSON.stringify(B.skipped)}` : `threw ${B.threw}`);
  check("D-9 case B names the clip it left out", B.ok === true && (B.skipped || []).some((s) => s.id === "M-SUBFRAME" && /frame/i.test(s.reason)));
  check("D-9 case D (ordinary 60fps frame) no longer throws", D.ok === true, D.ok ? `skipped ${JSON.stringify(D.skipped)}` : `threw ${D.threw}`);
  check("D-9 case B document is DTD-valid", B.ok === true && B.dtd === "ok", B.ok ? String(B.dtd).slice(0, 120) : "");

  // ================================================== the hostile matrix
  say("");
  say("================ the hostile matrix, re-validated against the real 1.10 DTD");
  const hostile: [string, SessionClip[], any][] = [
    ["01 one clip, no library, no project", [clip("H-01", good25)], {}],
    ["02 library + event + project in a second event", [clip("H-02", good25)], { library, project: project30 }],
    ["03 mixed frame rates in one document", [clip("H-03a", good25), clip("H-03b", good30)], { library, project: project30 }],
    ["04 name with & < > \" '", [clip("H-04", good25, [{ start: 0, end: 2 }], { label: `a & b < c > d " e ' f` })], { library, project: project30 }],
    ["05 emoji and RTL in the name", [clip("H-05", good25, [{ start: 0, end: 2 }], { label: "تجربة 😀 clip" })], { library, project: project30 }],
    ["06 newline in the name", [clip("H-06", good25, [{ start: 0, end: 2 }], { label: "line one\nline two" })], { library, project: project30 }],
    ["07 unicode library path", [clip("H-07", good25)], { library, project: project30 }],
    ["08 SYMLINKED library path", [clip("H-08", good25)], { library: linkedLib, project: project30 }],
    ["09 500-character event name", [clip("H-09", good25)], { eventName: "E".repeat(500), library, project: project30 }],
    ["10 event name with & < > \" ' and control chars", [clip("H-10", good25)], { eventName: `ev & < > " ' \u0007\u0000 x`, library, project: project30 }],
    ["11 event name a/b\\c:d*e?f\"g<h>i|j", [clip("H-11", good25)], { eventName: 'a/b\\c:d*e?f"g<h>i|j', library, project: project30 }],
    ["12 media event equal to the project event (must merge)", [clip("H-12", good25)], { eventName: "Projects event", library, project: project30 }],
    ["13 empty event name", [clip("H-13", good25)], { eventName: "", library, project: project30 }],
    ["14 whitespace event name", [clip("H-14", good25)], { eventName: "   ", library, project: project30 }],
    ["15 duplicate project names", [clip("H-15a", good25, [{ start: 0, end: 2 }], { projectName: "Same name" }), clip("H-15b", good30, [{ start: 0, end: 2 }], { projectName: "Same name" })], { library, project: project30 }],
    ["16 several segments in one clip", [clip("H-16", good25, [{ start: 0, end: 1 }, { start: 1.5, end: 2.5 }])], { library, project: project30 }],
    ["17 500-char clip label", [clip("H-17", good25, [{ start: 0, end: 2 }], { label: "L".repeat(500) })], { library, project: project30 }],
    ["18 library path containing a newline", [clip("H-18", good25)], { library: library + "\nx", project: project30 }],
    ["19 relative library path (must be refused)", [clip("H-19", good25)], { library: "Relative.fcpbundle", project: project30 }],
    ["20 library that does not exist (must fail closed)", [clip("H-20", good25)], { library: path.join(ROOT, "Gone.fcpbundle"), project: project30 }],
    ["21 library that is a FILE", [clip("H-21", good25)], { library: broken, project: project30 }],
    ["22 300-character library path", [clip("H-22", good25)], { library: path.join(ROOT, "L".repeat(240) + ".fcpbundle"), project: project30 }],
    ["23 library path containing ..", [clip("H-23", good25)], { library: path.join(ROOT, "..", "d6", "Client Library تجربة.fcpbundle"), project: project30 }],
    ["24 project name pattern with an empty token", [clip("H-24", good25)], { library, project: { ...project30, namePattern: "{clipId} - {label} - {campaign}" } }],
  ];
  let docs = 0;
  let valid = 0;
  const strays: string[] = [];
  for (const [name, clips, opts] of hostile) {
    const r = await run(name, clips, opts);
    if (r.ok) {
      docs++;
      if (r.wellFormed === "ok" && r.dtd === "ok") valid++;
      say(`  ${name}: included=${r.included} events=${r.events} projects=${r.projects} library=<${r.libraryElements}> importOption=<${r.importOption}> filename=${JSON.stringify(r.filename)} wf=${r.wellFormed === "ok" ? "ok" : r.wellFormed} dtd=${r.dtd === "ok" ? "ok" : r.dtd}`);
      if (r.libraryElements !== "0") strays.push(`${name}: <library> element present`);
      if (opts.library && r.importOption !== "1") strays.push(`${name}: import-options missing`);
    } else {
      say(`  ${name}: REFUSED — ${r.threw}`);
    }
  }
  say("");
  say(`documents produced: ${docs}, valid against the 1.10 DTD: ${valid}`);
  check("every document produced is DTD-valid", docs === valid, `${valid}/${docs}`);
  check("no <library> element in any document and the import option is always set", strays.length === 0, strays.join("; "));
  say("stray library directories created by a refused send:",
    ["Gone.fcpbundle", "Relative.fcpbundle", "L".repeat(240) + ".fcpbundle"].filter((n) => fs.existsSync(path.join(ROOT, n))));

  // the project-in-a-second-event structure, asserted rather than eyeballed
  const structural = await run("structure", [clip("S-01", good25), clip("S-02", good30)], { library, project: project30 });
  if (structural.ok) {
    const f = structural.file;
    say("");
    say("================ structure of the library + event + project document");
    const q = (e: string) => count(f, e);
    say("  events:", q("//event"), "| event names:", execFileSync("xmllint", ["--xpath", "string(//event[1]/@name)", f]).toString(), "/", execFileSync("xmllint", ["--xpath", "string(//event[2]/@name)", f]).toString());
    say("  asset-clips in the media event:", q("//event[1]/asset-clip"));
    say("  projects in the second event:", q("//event[2]/project"));
    say("  spine asset-clips referencing an asset:", q("//project//spine/asset-clip[@ref]"));
    const refs = execFileSync("xmllint", ["--xpath", "//project//spine/asset-clip/@ref", f]).toString();
    const assetIds = execFileSync("xmllint", ["--xpath", "//asset/@id", f]).toString();
    say("  project refs:", refs.trim(), "| asset ids:", assetIds.trim());
    check("the project's spine references the shared asset", refs.replace(/[^r\d]/g, "").length > 0 && assetIds.includes(refs.replace(/.*ref="([^"]+)".*/s, "$1")));
    say("  import-options is the first child of fcpxml:", execFileSync("xmllint", ["--xpath", "name(/fcpxml/*[1])", f]).toString());
  }

  fs.writeFileSync(path.join(HERE, "out", "d6-fcpxml.txt"), lines.join("\n") + "\n");
  say("");
  say(`ASSERTIONS: ${pass} passed, ${fail} failed`);
  fs.writeFileSync(path.join(HERE, "out", "d6-fcpxml.txt"), lines.join("\n") + "\n");
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e && e.stack ? e.stack : e));
  fs.mkdirSync(path.join(HERE, "out"), { recursive: true });
  fs.writeFileSync(path.join(HERE, "out", "d6-fcpxml.txt"), lines.join("\n") + "\n");
  process.exit(1);
});
