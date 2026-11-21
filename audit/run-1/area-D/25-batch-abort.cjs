/**
 * Area D / does one bad clip lose the whole batch?
 *
 * A clip whose file cannot be PROBED is reported and skipped (documented
 * behaviour). A clip that probes fine but is shorter than one frame of the
 * project timeline throws from buildFcpxml, which buildSessionFcpxml does not
 * catch, so the whole document is refused and every good clip in the batch is
 * lost. This runs the product's own module to show the difference.
 *
 * Also checks the clips/data separation rule in src/lib/campaigns.ts.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const REPO = "/home/user/stream-trimmer";
const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const MEDIA = `${SCRATCH}/Dmedia`;
const OUT = `${REPO}/audit/run-1/area-D/out/batch`;
fs.mkdirSync(OUT, { recursive: true });

const bundle = (src, name) => {
  const out = path.join(OUT, name);
  execFileSync(path.join(REPO, "node_modules", ".bin", "esbuild"),
    [src, "--bundle", "--platform=node", "--format=cjs", `--outfile=${out}`], { stdio: "inherit" });
  return require(out);
};
const F = bundle(path.join(REPO, "src", "lib", "fcpxml.ts"), "_f.cjs");
const C = bundle(path.join(REPO, "src", "lib", "campaigns.ts"), "_c.cjs");

const probe = async (file) => ({
  kind: "ffprobe",
  json: JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_streams", "-show_format", file]).toString()),
});

(async () => {
  const good = (id) => ({ id, path: `${MEDIA}/clip30.mp4`, segments: [{ start: 0, end: 3 }] });
  const subframe = { id: "M-SUBFRAME", path: `${MEDIA}/tiny.mp4`, segments: [{ start: 0, end: 0 }] };
  const unprobeable = { id: "M-BROKEN", path: `${MEDIA}/empty.mp4`, segments: [{ start: 0, end: 3 }] };
  const project = { eventName: "Projects", namePattern: "{clipId}", timeline: F.DEFAULT_TIMELINE };

  console.log("=== A. 3 good clips + 1 UNPROBEABLE clip, projects on ===");
  try {
    const r = await F.buildSessionFcpxml([good("A1"), good("A2"), unprobeable, good("A3")], "Ev", probe, { project });
    console.log(`  included: ${r.included}   projects: ${r.projectNames.length}`);
    console.log(`  skipped:  ${r.skipped.map((s) => s.id).join(", ")}`);
    console.log("  => the good clips SURVIVE");
  } catch (e) { console.log("  THREW:", e.message); }

  console.log("\n=== B. 3 good clips + 1 clip shorter than one timeline frame, projects on ===");
  try {
    const r = await F.buildSessionFcpxml([good("B1"), good("B2"), subframe, good("B3")], "Ev", probe, { project });
    console.log(`  included: ${r.included}  skipped: ${JSON.stringify(r.skipped)}`);
  } catch (e) {
    console.log("  THREW:", e.message);
    console.log("  => the ENTIRE document is refused; 3 good clips are lost, and the message names");
    console.log("     only the one bad clip with no hint that the others were ready.");
  }

  console.log("\n=== C. the same batch with projects OFF ===");
  try {
    const r = await F.buildSessionFcpxml([good("C1"), subframe, good("C2")], "Ev", probe, {});
    console.log(`  included: ${r.included}  skipped: ${JSON.stringify(r.skipped)}`);
    const f = path.join(OUT, "C-subframe-media-only.fcpxml");
    fs.writeFileSync(f, r.xml);
    try { execFileSync("xmllint", ["--noout", "--dtdvalid", `${SCRATCH}/FCPXMLv1_10.dtd`, f], { stdio: ["ignore", "pipe", "pipe"] }); console.log("  DTD: OK"); }
    catch (e) { console.log("  DTD: FAIL", String(e.stderr).trim()); }
    console.log("  the sub-frame clip's own entries:");
    console.log("   ", execFileSync("xmllint", ["--xpath", 'string(//asset[@name="M-SUBFRAME"]/@duration)', f]).toString());
    console.log("   format:", execFileSync("xmllint", ["--xpath", 'string(//format[@id="r2"]/@frameDuration)', f]).toString());
    console.log("  => with projects OFF the same clip is accepted, so the two paths disagree");
  } catch (e) { console.log("  THREW:", e.message); }

  console.log("\n=== D. the clips/data separation rule (src/lib/campaigns.ts sameFolder) ===");
  const pairs = [
    ["/a/b", "/a/b"],
    ["/a/b/", "/a/b"],
    ["/a/b", "/A/B"],
    ["/a/b", "/a/b/."],
    ["/a/b", "/a/c/../b"],
    ["/a/b", "/a/b/sub"],
    ["/a/b/sub", "/a/b"],
    ["/a/b", "//a//b"],
    ["/tmp/x", "/tmp/x/../x"],
  ];
  for (const [p, q] of pairs) {
    console.log(`  sameFolder(${JSON.stringify(p)}, ${JSON.stringify(q)}) = ${C.sameFolder(p, q)}`);
  }
  console.log("  (true means the app refuses the pick as 'Clips and Data need different folders')");
})();
