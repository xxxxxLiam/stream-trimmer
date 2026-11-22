/**
 * d3-containment-tail.cjs — the three containment questions d2 could not finish.
 *
 * Part A  the export path: `export:save` is owner-gated, so in a public build
 *         the containment behind it cannot be reached over the bridge. Its
 *         module (`electron/exportSave.cjs`) is pure, so it is driven directly
 *         IN THE MAIN PROCESS, unchanged, with real temp sources.
 * Part B  `dragTarget` (the main-side half of the D-1 keeper), same way.
 * Part C  how wide the allow-list is: `clipper.saveDirs` keeps every folder
 *         ever picked and is never pruned (D-25), so a user who once picked a
 *         parent folder widens the containment for ever. Canary retested.
 * Part D  a folder deleted between choosing and saving.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/d3-containment-tail.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "d3");
const log = L.mkLogger(path.join(__dirname, "out", "d3-containment-tail.txt"));
const say = log.say;

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"));
  const chosen = path.join(ROOT, "chosen");
  const outside = path.join(ROOT, "outside");
  const canaryDir = path.join(ROOT, "home-canary");
  const data = path.join(ROOT, "data");
  [chosen, outside, canaryDir, data].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  fs.writeFileSync(path.join(canaryDir, ".bashrc"), "original\n");

  // real temp sources in a ytchan- folder, which is what the exporter produces
  const tmpRoot = fs.realpathSync(os.tmpdir());
  const chanDir = fs.mkdtempSync(path.join(tmpRoot, "ytchan-"));
  fs.writeFileSync(path.join(chanDir, "videos.csv"), "a,b\n1,2\n");
  const chanDir2 = fs.mkdtempSync(path.join(tmpRoot, "ytchan-"));
  fs.writeFileSync(path.join(chanDir2, "videos.csv"), "a,b\n3,4\n");

  // ------------------------------------------------------------------ PART A
  // exportSave.cjs and pathSafety.cjs declare themselves pure ("no electron
  // import ... so the path checks can be tested"), so they are required here
  // UNCHANGED and driven with real files. No logic is reimplemented.
  say("================ PART A — exportSave.cjs, required unchanged");
  const { saveExportFiles } = require(path.join(L.REPO, "electron", "exportSave.cjs"));
  const expCases = [
    ["folder .. with roots", { dirPath: chosen, folder: "..", files: [{ name: "esc.csv", path: path.join(chanDir, "videos.csv") }], tmpRoot, allowedRoots: [chosen] }],
    ["dirPath outside with roots", { dirPath: outside, folder: "e", files: [{ name: "e.csv", path: path.join(chanDir, "videos.csv") }], tmpRoot, allowedRoots: [chosen] }],
    ["canary dotfile with roots", { dirPath: canaryDir, folder: ".", files: [{ name: ".bashrc", path: path.join(chanDir, "videos.csv") }], tmpRoot, allowedRoots: [chosen] }],
    ["file name traversal", { dirPath: chosen, folder: "ok", files: [{ name: "../../esc.csv", path: path.join(chanDir, "videos.csv") }], tmpRoot, allowedRoots: [chosen] }],
    ["source outside a ytchan- folder", { dirPath: chosen, folder: "ok", files: [{ name: "x.csv", path: path.join(chosen, "nothing.csv") }], tmpRoot, allowedRoots: [chosen] }],
    ["CONTROL good export", { dirPath: chosen, folder: "chan-export-2026-01-01", files: [{ name: "videos.csv", path: path.join(chanDir, "videos.csv") }], tmpRoot, allowedRoots: [chosen] }],
    ["SAME folder again (second run of the day)", { dirPath: chosen, folder: "chan-export-2026-01-01", files: [{ name: "videos.csv", path: path.join(chanDir2, "videos.csv") }], tmpRoot, allowedRoots: [chosen] }],
    ["no allowedRoots given at all", { dirPath: outside, folder: "e2", files: [{ name: "e.csv", path: path.join(chanDir, "videos.csv") }], tmpRoot }],
  ];
  for (const [name, args] of expCases) {
    let r;
    try {
      r = await saveExportFiles(args);
    } catch (e) {
      r = { threw: String(e && e.message ? e.message : e) };
    }
    say(`  ${name} -> ${JSON.stringify(r)}`);
  }
  say("  chosen/ now:", L.treeOf(chosen));
  say("  outside/ now:", L.treeOf(outside));
  say("  canary:", L.fsSnap(path.join(canaryDir, ".bashrc")).head);
  const second = path.join(chosen, "chan-export-2026-01-01", "videos.csv");
  say("  content at the same CSV name after the second run:", fs.existsSync(second) ? fs.readFileSync(second, "utf8").trim().replace(/\n/g, " / ") : "<gone>");
  say("  NOTE: main always passes saveRoots(), so the 'no allowedRoots' row is the module contract, not a live hole.");

  // ------------------------------------------------------------------ PART B
  say("");
  say("================ PART B — dragTarget, required unchanged");
  const { dragTarget } = require(path.join(L.REPO, "electron", "pathSafety.cjs"));
  const clipFile = path.join(chosen, "ACM-stub0000001-01.mp4");
  fs.writeFileSync(clipFile, "media");
  const strayFile = path.join(outside, "stray.mp4");
  fs.writeFileSync(strayFile, "media");
  try { fs.symlinkSync(strayFile, path.join(chosen, "link-to-stray.mp4")); } catch {}
  const probe = (p) => {
    try {
      const r = dragTarget(p, [chosen]);
      return r === null ? "REFUSED" : r.replace(chosen, "<chosen>");
    } catch (e) {
      return `threw ${e.message}`;
    }
  };
  say("  ", {
    insideAKnownFolder: probe(clipFile),
    outsideEveryKnownFolder: probe(strayFile),
    symlinkInsidePointingOut: probe(path.join(chosen, "link-to-stray.mp4")),
    missingFile: probe(path.join(chosen, "gone.mp4")),
    theFolderItself: probe(chosen),
    relativePath: probe("relative/path.mp4"),
    withNewline: probe(clipFile + "\nx"),
    notAString: probe(42),
  });

  // ------------------------------------------------------------------ PART C
  say("");
  say("================ PART C — the allow-list is as wide as clipper.saveDirs");
  const cRoot = path.join(ROOT, "widened");
  const cChosen = path.join(cRoot, "chosen");
  const cCanaryDir = path.join(cRoot, "home-canary");
  fs.mkdirSync(cChosen, { recursive: true });
  fs.mkdirSync(cCanaryDir, { recursive: true });
  const cCanary = path.join(cCanaryDir, ".bashrc");
  fs.writeFileSync(cCanary, "original\n");
  const cb = L.fsSnap(cCanary);
  {
    const b = await L.launch({
      label: "d3-widened",
      cwd: stub,
      seed: {
        "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", cChosen, path.join(cRoot, "data"), { prefix: "ACM" })],
        "clipper.activeCampaign": "acme-q4",
        "clipper.clipsDir": cChosen,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": cChosen,
        // The user once picked the PARENT folder. saveDirs never forgets.
        "clipper.saveDirs": [cChosen, cRoot],
      },
    });
    const r = await b.win.evaluate(
      async ([dir]) => window.electronAPI.saveFile({ dirPath: dir, filename: ".bashrc", data: "PWNED" }),
      [cCanaryDir],
    );
    say("  canary write while the parent folder sits in saveDirs:", r);
    const ca = L.fsSnap(cCanary);
    say("  canary:", { ino: [cb.ino, ca.ino], size: [cb.size, ca.size], contents: ca.head && ca.head.trim() });
    say("  VERDICT:", L.fsDiff(cb, ca).sameBytes === true ? "still contained" : "the containment is bypassed by an ordinary earlier pick");
    // and with the HOME directory remembered, which is a folder a user can pick
    const home = os.homedir();
    const r2 = await b.win.evaluate(
      async ([dir, home]) => {
        await window.electronAPI.setSetting("clipper.saveDirs", [dir, home]);
        return window.electronAPI.saveFile({ dirPath: home, filename: "audit-run2-canary.txt", data: "x" });
      },
      [cChosen, home],
    );
    say("  with the home directory remembered, a write straight into $HOME:", r2);
    if (r2 && r2.ok) {
      say("  created:", r2.path, "— removing it again");
      try {
        fs.rmSync(r2.path);
      } catch {}
    }
    await b.close();
  }

  // ------------------------------------------------------------------ PART D
  say("");
  say("================ PART D — the clips folder is deleted while a cut is running");
  const dRoot = path.join(ROOT, "vanish");
  const dClips = path.join(dRoot, "Clips");
  fs.mkdirSync(dClips, { recursive: true });
  L.writeCfg(path.join(ROOT, "stub"), { delayMs: 5000 });
  {
    const c = await L.launch({
      label: "d3-vanish",
      cwd: stub,
      seed: {
        "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", dClips, path.join(dRoot, "data"), { prefix: "ACM" })],
        "clipper.activeCampaign": "acme-q4",
        "clipper.clipsDir": dClips,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": dClips,
        "clipper.saveDirs": [dClips],
      },
    });
    await L.loadVideo(c.win);
    await L.mark(c.win, "00:00:02", "00:00:08");
    await c.win.click("#ui-add-segment");
    await c.win.click("#ui-cut");
    await c.win.waitForTimeout(2500);
    fs.rmSync(dClips, { recursive: true, force: true });
    say("  clips folder deleted mid-download; waiting for the app to answer");
    await c.win
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).some((n) =>
            /Clip saved|Error|could not|failed|no such file|Unexpected/i.test(n.textContent || ""),
          ),
        null,
        { timeout: 120000 },
      )
      .catch(() => {});
    await c.win.waitForTimeout(1500);
    const msgs = await L.messages(c.win);
    say("  messages on screen:", msgs);
    say("  mentions a next step:", msgs.join(" ").match(/choose|pick|folder is no longer|try again/i) ? "yes" : "no");
    say("  raw errno/stack shown:", /ENOENT|at async|internal\/fs/.test(msgs.join(" ")) ? "YES" : "no");
    say("  Unexpected save location shown:", /Unexpected save location/.test(msgs.join(" ")) ? "YES" : "no");
    say("  clips folder recreated by the app:", fs.existsSync(dClips));
    const tmps = fs.readdirSync(os.tmpdir()).filter((f) => f.startsWith("ytclip-"));
    say("  ytclip- temp folders left behind:", tmps.length);
    await c.shot("folder-vanished");
    say("  clip log:", (c.logs.stdout.join("").match(/\[clip\][^\n]*/g) || []).slice(-4));
    await c.close();
  }

  log.flush();
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
