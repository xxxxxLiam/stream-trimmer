/**
 * Area D / IPC security.
 *
 * Calls every file:* / clip:* / editor:* channel that area D owns, directly
 * from the renderer through window.electronAPI, with hostile arguments:
 * absolute paths outside the chosen folder, "..", null, undefined, numbers,
 * objects, enormous strings, arrays where a string is expected.
 *
 * Asserts, for every call:
 *   - the main process survives (a later probe call still answers)
 *   - nothing is written outside the chosen folder (a canary tree is diffed)
 *   - no unhandled rejection reaches the renderer
 *
 * Changes no product code. Writes only under audit/run-1/area-D/.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { launchApp } = require("/home/user/stream-trimmer/audit/harness/app.cjs");

const SCRATCH = "/tmp/claude-0/-home-user-stream-trimmer/fbb59225-b5c7-558d-a212-aff901156a0b/scratchpad";
const STUB = `${SCRATCH}/stubD`;
const OUT = "/home/user/stream-trimmer/audit/run-1/area-D/out/ipc";

/** Snapshot every path under a root, so a write outside the chosen dir shows up. */
function snapshot(root) {
  const seen = [];
  const walk = (d) => {
    let names;
    try {
      names = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of names) {
      const full = path.join(d, e.name);
      seen.push(e.isDirectory() ? full + "/" : full);
      if (e.isDirectory()) walk(full);
    }
  };
  walk(root);
  return seen.sort();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });

  // The sandbox: CHOSEN is the folder the user picked. OUTSIDE is a sibling
  // that nothing in area D is ever allowed to touch.
  const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), "D-ipc-"));
  const CHOSEN = path.join(sandbox, "chosen");
  const OUTSIDE = path.join(sandbox, "outside");
  fs.mkdirSync(CHOSEN);
  fs.mkdirSync(OUTSIDE);
  fs.writeFileSync(path.join(OUTSIDE, "keep.txt"), "untouched\n");
  const HOME_CANARY = path.join(sandbox, "home-canary");
  fs.mkdirSync(HOME_CANARY);
  fs.writeFileSync(path.join(HOME_CANARY, ".bashrc"), "original\n");

  const before = snapshot(sandbox);

  const a = await launchApp({
    label: "D-ipc",
    cwd: STUB,
    outDir: OUT,
    seed: {
      "clipper.dataDirConfirmed": true,
      "clipper.clipsDir": CHOSEN,
      "clipper.saveDir": CHOSEN,
    },
  });

  const results = [];
  try {
    await a.win.waitForSelector("header", { timeout: 20000 });
    const progress = [];
    await a.win.exposeFunction("__auditProgress", (name) => {
      progress.push(name);
      process.stdout.write(`  . ${name}\n`);
    });

    const report = await a.win.evaluate(async (dirs) => {
      const { CHOSEN, OUTSIDE, HOME_CANARY, sandbox } = dirs;
      const api = window.electronAPI;
      const ed = api.editor;
      const BIG = "A".repeat(2 * 1024 * 1024);
      const LONG_PATH = "/" + "p".repeat(300);
      const out = [];
      const unhandled = [];
      window.addEventListener("unhandledrejection", (e) =>
        unhandled.push(String(e.reason)),
      );

      // Every call is raced against a 8s deadline: a channel that never
      // answers is a finding, not a reason for the audit to hang.
      const TIMEOUT_MS = 8000;
      const call = async (name, fn) => {
        const t0 = Date.now();
        try {
          const r = await Promise.race([
            Promise.resolve().then(fn),
            new Promise((_, rej) => setTimeout(() => rej(new Error("__AUDIT_TIMEOUT__")), TIMEOUT_MS)),
          ]);
          out.push({
            name,
            threw: false,
            ms: Date.now() - t0,
            result: JSON.stringify(r)?.slice(0, 400) ?? String(r),
          });
        } catch (err) {
          const timedOut = String(err).includes("__AUDIT_TIMEOUT__");
          out.push({
            name,
            threw: !timedOut,
            timedOut,
            ms: Date.now() - t0,
            result: timedOut ? `NO ANSWER after ${TIMEOUT_MS}ms` : String(err).slice(0, 400),
          });
        }
        window.__auditProgress && window.__auditProgress(name);
      };

      // ---------------- file:save ----------------
      await call("file:save null", () => api.saveFile(null));
      await call("file:save undefined", () => api.saveFile(undefined));
      await call("file:save number", () => api.saveFile(42));
      await call("file:save array", () => api.saveFile([CHOSEN, "x.txt", "d"]));
      await call("file:save dirPath=number", () =>
        api.saveFile({ dirPath: 7, filename: "x.txt", data: "d" }));
      await call("file:save filename=array", () =>
        api.saveFile({ dirPath: CHOSEN, filename: ["a", "b"], data: "d" }));
      await call("file:save filename=dotdot", () =>
        api.saveFile({ dirPath: CHOSEN, filename: "..", data: "pwn" }));
      await call("file:save filename=dotdot-traverse", () =>
        api.saveFile({ dirPath: CHOSEN, filename: "../../outside/pwned-save.txt", data: "pwn" }));
      await call("file:save dirPath=OUTSIDE (not the chosen folder)", () =>
        api.saveFile({ dirPath: OUTSIDE, filename: "pwned-abs.txt", data: "pwn" }));
      await call("file:save overwrite HOME_CANARY/.bashrc", () =>
        api.saveFile({ dirPath: HOME_CANARY, filename: ".bashrc", data: "PWNED" }));
      await call("file:save data=object", () =>
        api.saveFile({ dirPath: CHOSEN, filename: "obj.bin", data: { a: 1 } }));
      await call("file:save data=enormous", () =>
        api.saveFile({ dirPath: CHOSEN, filename: "big.bin", data: BIG }));
      await call("file:save filename=newline", () =>
        api.saveFile({ dirPath: CHOSEN, filename: "new\nline.txt", data: "d" }));
      await call("file:save dirPath=enormous", () =>
        api.saveFile({ dirPath: BIG, filename: "x.txt", data: "d" }));
      await call("file:save filename=nul", () =>
        api.saveFile({ dirPath: CHOSEN, filename: "a\u0000b.txt", data: "d" }));

      // ---------------- file:saveFiles ----------------
      await call("file:saveFiles null", () => api.saveFiles(null));
      await call("file:saveFiles folder=dotdot", () =>
        api.saveFiles({ dirPath: CHOSEN, folder: "..", files: [{ name: "esc.csv", contents: "x" }] }));
      await call("file:saveFiles folder=../outside", () =>
        api.saveFiles({ dirPath: CHOSEN, folder: "../outside", files: [{ name: "esc2.csv", contents: "x" }] }));
      await call("file:saveFiles files=notarray", () =>
        api.saveFiles({ dirPath: CHOSEN, folder: "f", files: "nope" }));
      await call("file:saveFiles file.name empty then good", () =>
        api.saveFiles({ dirPath: CHOSEN, folder: "partial", files: [{ name: "", contents: "x" }, { name: "second.csv", contents: "y" }] }));
      await call("file:saveFiles dirPath=OUTSIDE", () =>
        api.saveFiles({ dirPath: OUTSIDE, folder: "sf", files: [{ name: "pwned-sf.csv", contents: "x" }] }));

      // ---------------- clip:save ----------------
      await call("clip:save null", () => api.saveClip(null));
      await call("clip:save numbers", () => api.saveClip({ tempPath: 1, dirPath: 2, filename: 3 }));
      await call("clip:save tempPath outside temp", () =>
        api.saveClip({ tempPath: "/etc/hostname", dirPath: CHOSEN, filename: "stolen.txt" }));
      await call("clip:save tempPath missing", () =>
        api.saveClip({ tempPath: "/tmp/ytclip-nope/none.mp4", dirPath: CHOSEN, filename: "x.mp4" }));
      await call("clip:save tempPath=enormous", () =>
        api.saveClip({ tempPath: BIG, dirPath: CHOSEN, filename: "x.mp4" }));
      await call("clip:save tempPath=array", () =>
        api.saveClip({ tempPath: [CHOSEN], dirPath: CHOSEN, filename: "x.mp4" }));

      // ---------------- export:save ----------------
      await call("export:save null", () => api.saveExport(null));
      await call("export:save folder=dotdot", () =>
        api.saveExport({ dirPath: CHOSEN, folder: "..", files: [{ name: "a.csv", path: "/etc/hostname" }] }));
      await call("export:save files=[]", () =>
        api.saveExport({ dirPath: CHOSEN, folder: "f", files: [] }));
      await call("export:save file.path outside temp", () =>
        api.saveExport({ dirPath: CHOSEN, folder: "f", files: [{ name: "a.csv", path: "/etc/hostname" }] }));
      await call("export:save dirPath=number", () =>
        api.saveExport({ dirPath: 5, folder: "f", files: [{ name: "a", path: "/etc/hostname" }] }));

      // ---------------- file:exists ----------------
      await call("file:exists null", () => api.fileExists(null));
      await call("file:exists number", () => api.fileExists(5));
      await call("file:exists object", () => api.fileExists({ a: 1 }));
      await call("file:exists enormous", () => api.fileExists(BIG));
      await call("file:exists 300-char", () => api.fileExists(LONG_PATH));
      await call("file:exists newline", () => api.fileExists("/tmp/a\nb"));

      // ---------------- file:showInFolder ----------------
      await call("file:showInFolder null", () => api.showInFolder(null));
      await call("file:showInFolder number", () => api.showInFolder(3));
      await call("file:showInFolder /etc/shadow", () => api.showInFolder("/etc/shadow"));
      await call("file:showInFolder enormous", () => api.showInFolder(BIG));

      // ---------------- file:startDrag (send, no reply) ----------------
      await call("file:startDrag null", async () => { api.startDrag(null); return "sent"; });
      await call("file:startDrag number", async () => { api.startDrag(9); return "sent"; });
      await call("file:startDrag object", async () => { api.startDrag({ p: 1 }); return "sent"; });
      await call("file:startDrag array", async () => { api.startDrag(["/etc/hostname"]); return "sent"; });
      await call("file:startDrag enormous", async () => { api.startDrag(BIG); return "sent"; });
      // NOTE: startDrag with a path that really EXISTS is deliberately NOT
      // called here. It freezes the main process (see 11-startdrag-freeze.cjs),
      // which would stop this script from reporting anything at all.

      // ---------------- editor:probe ----------------
      await call("editor:probe null", () => ed.probe(null));
      await call("editor:probe number", () => ed.probe(1));
      await call("editor:probe object", () => ed.probe({}));
      await call("editor:probe array", () => ed.probe(["/etc/hostname"]));
      await call("editor:probe relative", () => ed.probe("relative/x.mp4"));
      await call("editor:probe dotdot", () => ed.probe("../../../etc/hostname"));
      await call("editor:probe 300-char", () => ed.probe(LONG_PATH));
      await call("editor:probe enormous", () => ed.probe(BIG));
      await call("editor:probe /etc/hostname", () => ed.probe("/etc/hostname"));
      await call("editor:probe /dev/zero", () => ed.probe("/dev/zero"));

      // ---------------- editor:writeFcpxml ----------------
      const XML = '<?xml version="1.0" encoding="UTF-8"?>\n<fcpxml version="1.10"/>\n';
      await call("editor:writeFcpxml null", () => ed.writeFcpxml(null));
      await call("editor:writeFcpxml no contents", () => ed.writeFcpxml({ dirPath: CHOSEN, filename: "a" }));
      await call("editor:writeFcpxml contents=object", () =>
        ed.writeFcpxml({ dirPath: CHOSEN, filename: "a", contents: { x: 1 } }));
      await call("editor:writeFcpxml relative dirPath", () =>
        ed.writeFcpxml({ dirPath: "rel/dir", filename: "a", contents: XML }));
      await call("editor:writeFcpxml dirPath=OUTSIDE", () =>
        ed.writeFcpxml({ dirPath: OUTSIDE, filename: "pwned-fcp", contents: XML }));
      await call("editor:writeFcpxml dirPath=brand-new tree under sandbox", () =>
        ed.writeFcpxml({ dirPath: sandbox + "/made/up/deep", filename: "made", contents: XML }));
      await call("editor:writeFcpxml filename=../escape", () =>
        ed.writeFcpxml({ dirPath: CHOSEN, filename: "../../outside/pwned-fcp2", contents: XML }));
      await call("editor:writeFcpxml filename=array", () =>
        ed.writeFcpxml({ dirPath: CHOSEN, filename: ["a"], contents: XML }));
      await call("editor:writeFcpxml filename=number", () =>
        ed.writeFcpxml({ dirPath: CHOSEN, filename: 5, contents: XML }));
      await call("editor:writeFcpxml filename=enormous", () =>
        ed.writeFcpxml({ dirPath: CHOSEN, filename: BIG, contents: XML }));
      await call("editor:writeFcpxml contents=enormous-xml", () =>
        ed.writeFcpxml({ dirPath: CHOSEN, filename: "big", contents: '<?xml' + BIG }));

      // ---------------- editor:openWith ----------------
      await call("editor:openWith null", () => ed.openWith(null));
      await call("editor:openWith app=__proto__", () => ed.openWith({ app: "__proto__" }));
      await call("editor:openWith app=constructor", () => ed.openWith({ app: "constructor" }));
      await call("editor:openWith app=toString", () => ed.openWith({ app: "toString" }));
      await call("editor:openWith app=premiere", () => ed.openWith({ app: "premiere" }));
      await call("editor:openWith app=number", () => ed.openWith({ app: 1 }));
      await call("editor:openWith app=array", () => ed.openWith({ app: ["finalcut"] }));
      await call("editor:openWith finalcut file=relative", () =>
        ed.openWith({ app: "finalcut", file: "rel.fcpxml" }));
      await call("editor:openWith finalcut file=number", () =>
        ed.openWith({ app: "finalcut", file: 3 }));
      await call("editor:openWith finalcut file=enormous", () =>
        ed.openWith({ app: "finalcut", file: BIG }));

      // ---------------- editor:reveal ----------------
      await call("editor:reveal null", () => ed.reveal(null));
      await call("editor:reveal number", () => ed.reveal(2));
      await call("editor:reveal relative", () => ed.reveal("rel"));
      await call("editor:reveal enormous", () => ed.reveal(BIG));
      await call("editor:reveal 300-char", () => ed.reveal(LONG_PATH));

      // ---------------- editor:copyFiles ----------------
      await call("editor:copyFiles null", () => ed.copyFiles(null));
      await call("editor:copyFiles files=string", () => ed.copyFiles({ dirPath: CHOSEN, files: "/etc/hostname" }));
      await call("editor:copyFiles files=[]", () => ed.copyFiles({ dirPath: CHOSEN, files: [] }));
      await call("editor:copyFiles files=[number]", () => ed.copyFiles({ dirPath: CHOSEN, files: [1, 2] }));
      await call("editor:copyFiles files=[null]", () => ed.copyFiles({ dirPath: CHOSEN, files: [null] }));
      await call("editor:copyFiles copy /etc/hostname into CHOSEN", () =>
        ed.copyFiles({ dirPath: CHOSEN, files: ["/etc/hostname"] }));
      await call("editor:copyFiles dirPath=OUTSIDE", () =>
        ed.copyFiles({ dirPath: OUTSIDE, files: ["/etc/hostname"] }));
      await call("editor:copyFiles dirPath=new deep tree", () =>
        ed.copyFiles({ dirPath: sandbox + "/copy/made/up", files: ["/etc/hostname"] }));
      await call("editor:copyFiles relative dirPath", () => ed.copyFiles({ dirPath: "rel", files: ["/etc/hostname"] }));

      // ---------------- editor:pathExists ----------------
      await call("editor:pathExists null", () => ed.pathExists(null));
      await call("editor:pathExists number", () => ed.pathExists(0));
      await call("editor:pathExists object", () => ed.pathExists({}));
      await call("editor:pathExists relative", () => ed.pathExists("rel"));
      await call("editor:pathExists enormous", () => ed.pathExists(BIG));

      // ---------------- editor:installed ----------------
      await call("editor:installed", () => ed.installed());

      // Liveness: if the main process died, this never answers.
      await call("LIVENESS editor:pathExists(CHOSEN)", () => ed.pathExists(CHOSEN));
      await call("LIVENESS file:exists(CHOSEN)", () => api.fileExists(CHOSEN));

      await new Promise((r) => setTimeout(r, 300));
      return { out, unhandled };
    }, { CHOSEN, OUTSIDE, HOME_CANARY, sandbox });

    results.push(...report.out);
    fs.writeFileSync(
      path.join(OUT, "ipc-results.json"),
      JSON.stringify(report, null, 2),
    );

    const after = snapshot(sandbox);
    const added = after.filter((p) => !before.includes(p));
    const removed = before.filter((p) => !after.includes(p));
    const bashrc = fs.readFileSync(path.join(HOME_CANARY, ".bashrc"), "utf8");
    const keep = fs.existsSync(path.join(OUTSIDE, "keep.txt"))
      ? fs.readFileSync(path.join(OUTSIDE, "keep.txt"), "utf8")
      : "<DELETED>";

    const fsReport = {
      sandbox,
      chosen: CHOSEN,
      createdPaths: added,
      createdOutsideChosen: added.filter((p) => !p.startsWith(CHOSEN + path.sep)),
      removedPaths: removed,
      homeCanaryBashrc: bashrc,
      outsideKeepTxt: keep,
    };
    fs.writeFileSync(path.join(OUT, "fs-diff.json"), JSON.stringify(fsReport, null, 2));

    console.log("=== calls:", report.out.length);
    const liveness = report.out.filter((r) => r.name.startsWith("LIVENESS"));
    console.log("=== liveness:", JSON.stringify(liveness));
    console.log("=== renderer unhandled rejections:", JSON.stringify(report.unhandled));
    console.log("=== renderer threw (should be empty, the bridge returns {ok:false}):");
    for (const r of report.out.filter((r) => r.threw)) console.log("   THREW", r.name, "->", r.result);
    console.log("=== paths created OUTSIDE the chosen folder:");
    for (const p of fsReport.createdOutsideChosen) console.log("   ", p);
    console.log("=== paths created inside the chosen folder:");
    for (const p of added.filter((p) => p.startsWith(CHOSEN + path.sep))) console.log("   ", p);
    console.log("=== removed:", JSON.stringify(removed));
    console.log("=== HOME_CANARY/.bashrc now:", JSON.stringify(bashrc));
    console.log("=== OUTSIDE/keep.txt now:", JSON.stringify(keep));
    console.log("shot:", await a.shot("after-fuzz"));
    const crashed = await a.win.evaluate(() => document.body.innerText.length);
    console.log("=== renderer still rendering, body length:", crashed);
  } finally {
    await a.close();
  }

  const mainErrors = [];
  try {
    const logs = JSON.parse(fs.readFileSync(path.join(OUT, "logs.json"), "utf8"));
    for (const line of logs.stderr) if (/Error|Unhandled|FATAL/i.test(line)) mainErrors.push(line.trim());
    for (const line of logs.pageErrors) mainErrors.push("pageerror: " + line);
  } catch { /* no logs */ }
  console.log("=== main-process stderr of interest:");
  for (const l of mainErrors) console.log("   ", l.slice(0, 300));
  console.log("DONE. Full results:", path.join(OUT, "ipc-results.json"));
})().catch((e) => {
  console.error("SCRIPT FAILED:", e);
  process.exit(1);
});
