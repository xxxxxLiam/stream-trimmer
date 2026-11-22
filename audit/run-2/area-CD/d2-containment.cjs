/**
 * d2-containment.cjs — D-6 / D-7 re-verification with fresh hostile inputs, and
 * the behaviour change the containment check introduced.
 *
 * Part A  attacks on the resolved target, made from the renderer through the
 *         product's own preload bridge: `..`, `../..`, absolute paths outside,
 *         a symlink inside the chosen folder that points outside, a path with a
 *         newline, a 300-character path, unicode, a folder that is a file, and
 *         a dotfile canary outside the chosen folder. file:save,
 *         file:saveFiles, clip:save and export:save.
 * Part B  controls: the same calls that SHOULD work still work, and file:save
 *         no longer destroys a file of the same name (" 2").
 * Part C  the behaviour change: a write (or a drag) aimed at a folder the app
 *         was never told about is now refused. Does that block legitimate use?
 *         - a folder picked through the native dialog this session
 *         - a campaign whose clips folder was never the global one
 *         - dragging a clip that is in the clips folder
 *         - dragging a clip whose folder is no longer in settings
 * Part D  how wide the allow-list really is: `clipper.saveDirs` collects every
 *         folder ever picked (D-25), so an earlier pick of a parent folder is
 *         re-tested against the canary.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/d2-containment.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "d2");
const log = L.mkLogger(path.join(__dirname, "out", "d2-containment.txt"));
const say = log.say;

function sandbox(name) {
  const root = path.join(ROOT, name);
  fs.rmSync(root, { recursive: true, force: true });
  const chosen = path.join(root, "chosen");
  const outside = path.join(root, "outside");
  const canaryDir = path.join(root, "home-canary");
  fs.mkdirSync(chosen, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.mkdirSync(canaryDir, { recursive: true });
  fs.writeFileSync(path.join(canaryDir, ".bashrc"), "original\n");
  fs.writeFileSync(path.join(root, "is-a-file.txt"), "plain file\n");
  // a symlink INSIDE the chosen folder that points outside it
  try {
    fs.symlinkSync(outside, path.join(chosen, "link-to-outside"));
  } catch {}
  return { root, chosen, outside, canaryDir };
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"));

  // ================================================== PART A + B
  const s = sandbox("attack");
  const data = path.join(s.root, "data");
  fs.mkdirSync(data, { recursive: true });
  const canary = path.join(s.canaryDir, ".bashrc");
  const canaryBefore = L.fsSnap(canary);
  const treeBefore = L.treeOf(s.root);

  const a = await L.launch({
    label: "d2-attack",
    cwd: stub,
    seed: {
      "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", s.chosen, data, { prefix: "ACM" })],
      "clipper.activeCampaign": "acme-q4",
      "clipper.clipsDir": s.chosen,
      "clipper.dataDir": data,
      "clipper.dataDirConfirmed": true,
      "clipper.saveDir": s.chosen,
      "clipper.saveDirs": [s.chosen],
    },
  });

  const LONG = "L".repeat(300);
  const calls = [
    // --- file:save, hostile dirPath
    ["file:save canary dotfile outside", { fn: "saveFile", args: { dirPath: s.canaryDir, filename: ".bashrc", data: "PWNED" } }],
    ["file:save absolute outside", { fn: "saveFile", args: { dirPath: s.outside, filename: "pwned-abs.txt", data: "x" } }],
    ["file:save /etc", { fn: "saveFile", args: { dirPath: "/etc", filename: "pwned-etc.txt", data: "x" } }],
    ["file:save dirPath = chosen/..", { fn: "saveFile", args: { dirPath: path.join(s.chosen, ".."), filename: "pwned-dotdot.txt", data: "x" } }],
    ["file:save dirPath = chosen/../..", { fn: "saveFile", args: { dirPath: path.join(s.chosen, "..", ".."), filename: "pwned-dotdot2.txt", data: "x" } }],
    ["file:save dirPath = chosen/./", { fn: "saveFile", args: { dirPath: s.chosen + "/./", filename: "dot-slash.txt", data: "x" } }],
    ["file:save dirPath via symlink out of chosen", { fn: "saveFile", args: { dirPath: path.join(s.chosen, "link-to-outside"), filename: "pwned-symlink.txt", data: "x" } }],
    ["file:save relative dirPath", { fn: "saveFile", args: { dirPath: "chosen", filename: "rel.txt", data: "x" } }],
    ["file:save filename with newline", { fn: "saveFile", args: { dirPath: s.chosen, filename: "two\nlines.txt", data: "x" } }],
    ["file:save filename traversal", { fn: "saveFile", args: { dirPath: s.chosen, filename: "../../outside/pwned-save.txt", data: "x" } }],
    ["file:save filename ..", { fn: "saveFile", args: { dirPath: s.chosen, filename: "..", data: "x" } }],
    ["file:save 300-char dirPath", { fn: "saveFile", args: { dirPath: path.join(s.outside, LONG), filename: "long.txt", data: "x" } }],
    ["file:save 300-char filename inside chosen", { fn: "saveFile", args: { dirPath: s.chosen, filename: LONG + ".txt", data: "x" } }],
    ["file:save unicode name inside chosen", { fn: "saveFile", args: { dirPath: s.chosen, filename: "ملف تجربة 😀.txt", data: "x" } }],
    ["file:save unicode dir outside", { fn: "saveFile", args: { dirPath: path.join(s.outside, "تجربة"), filename: "u.txt", data: "x" } }],
    ["file:save dirPath is a FILE", { fn: "saveFile", args: { dirPath: path.join(s.root, "is-a-file.txt"), filename: "x.txt", data: "x" } }],
    ["file:save NUL in filename", { fn: "saveFile", args: { dirPath: s.chosen, filename: "nul\u0000byte.txt", data: "x" } }],
    // --- file:saveFiles, hostile folder
    ["saveFiles folder ..", { fn: "saveFiles", args: { dirPath: s.chosen, folder: "..", files: [{ name: "esc.csv", contents: "x" }] } }],
    ["saveFiles folder ../..", { fn: "saveFiles", args: { dirPath: s.chosen, folder: "../..", files: [{ name: "esc2.csv", contents: "x" }] } }],
    ["saveFiles folder . ", { fn: "saveFiles", args: { dirPath: s.chosen, folder: ".", files: [{ name: "dot.csv", contents: "x" }] } }],
    ["saveFiles folder ../outside", { fn: "saveFiles", args: { dirPath: s.chosen, folder: "../outside", files: [{ name: "esc3.csv", contents: "x" }] } }],
    ["saveFiles dirPath outside", { fn: "saveFiles", args: { dirPath: s.outside, folder: "sf", files: [{ name: "pwned-sf.csv", contents: "x" }] } }],
    ["saveFiles file name traversal", { fn: "saveFiles", args: { dirPath: s.chosen, folder: "ok", files: [{ name: "../../../esc4.csv", contents: "x" }] } }],
    ["saveFiles folder with newline", { fn: "saveFiles", args: { dirPath: s.chosen, folder: "two\nlines", files: [{ name: "nl.csv", contents: "x" }] } }],
    ["saveFiles 300-char folder", { fn: "saveFiles", args: { dirPath: s.chosen, folder: LONG, files: [{ name: "long.csv", contents: "x" }] } }],
    ["saveFiles folder = unicode", { fn: "saveFiles", args: { dirPath: s.chosen, folder: "مجلد 😀", files: [{ name: "u.csv", contents: "x" }] } }],
    ["saveFiles dirPath is a FILE", { fn: "saveFiles", args: { dirPath: path.join(s.root, "is-a-file.txt"), folder: "x", files: [{ name: "x.csv", contents: "x" }] } }],
    ["saveFiles folder through the symlink", { fn: "saveFiles", args: { dirPath: path.join(s.chosen, "link-to-outside"), folder: "sl", files: [{ name: "sl.csv", contents: "x" }] } }],
    // --- clip:save
    ["clip:save source outside the temp dir", { fn: "saveClip", args: { tempPath: path.join(s.root, "is-a-file.txt"), dirPath: s.chosen, filename: "fake.mp4" } }],
    ["clip:save dirPath outside", { fn: "saveClip", args: { tempPath: path.join(s.root, "is-a-file.txt"), dirPath: s.outside, filename: "fake.mp4" } }],
    // --- export:save (owner-gated; recorded for completeness)
    ["export:save dirPath outside", { fn: "saveExport", args: { dirPath: s.outside, folder: "e", files: [{ name: "e.csv", path: path.join(os.tmpdir(), "nope.csv") }] } }],
    ["export:save folder ..", { fn: "saveExport", args: { dirPath: s.chosen, folder: "..", files: [{ name: "e.csv", path: path.join(os.tmpdir(), "nope.csv") }] } }],
    // --- controls that must still work
    ["CONTROL file inside chosen", { fn: "saveFile", args: { dirPath: s.chosen, filename: "fine.txt", data: "ok" } }],
    ["CONTROL saveFiles folder ok", { fn: "saveFiles", args: { dirPath: s.chosen, folder: "ok-folder", files: [{ name: "ok.csv", contents: "ok" }] } }],
    ["CONTROL file inside the data folder", { fn: "saveFile", args: { dirPath: data, filename: "fine-data.txt", data: "ok" } }],
    ["CONTROL subfolder of chosen (already there)", { fn: "saveFile", args: { dirPath: path.join(s.chosen, "ok-folder"), filename: "nested.txt", data: "ok" } }],
  ];

  say("================ PART A/B — 36 calls through the product's own bridge");
  const results = [];
  for (const [name, spec] of calls) {
    const r = await a.win.evaluate(async ([fn, args]) => {
      const api = window.electronAPI;
      try {
        const map = {
          saveFile: (x) => api.saveFile(x),
          saveFiles: (x) => api.saveFiles(x),
          saveClip: (x) => api.saveClip(x),
          saveExport: (x) => api.saveExport ? api.saveExport(x) : (api.exportSave ? api.exportSave(x) : { ok: false, error: "<no bridge method>" }),
        };
        const out = await map[fn](args);
        return JSON.parse(JSON.stringify(out));
      } catch (e) {
        return { threw: String(e && e.message ? e.message : e) };
      }
    }, [spec.fn, spec.args]);
    results.push([name, r]);
    say(`  ${name}\n      -> ${JSON.stringify(r)}`);
  }

  const canaryAfter = L.fsSnap(canary);
  const cd = L.fsDiff(canaryBefore, canaryAfter);
  say("");
  say("canary .bashrc:", { ino: [canaryBefore.ino, canaryAfter.ino], size: [canaryBefore.size, canaryAfter.size], sameBytes: cd.sameBytes, contents: canaryAfter.head && canaryAfter.head.trim() });
  const treeAfter = L.treeOf(s.root);
  const created = treeAfter.filter((p) => !treeBefore.includes(p));
  say("paths created anywhere in the sandbox:", created);
  const escaped = created.filter((p) => !p.startsWith("chosen/") && !p.startsWith("data/"));
  say("CREATED OUTSIDE the chosen and data folders:", escaped.length ? escaped : "none");
  say("VERDICT containment:", escaped.length === 0 && cd.sameBytes === true ? "HELD" : "ESCAPED");

  // file:save no longer destroys a same-named file
  say("");
  say("B2. file:save over an existing name");
  const victim = path.join(s.chosen, "mine.txt");
  fs.writeFileSync(victim, "my own notes\n");
  const vb = L.fsSnap(victim);
  const r2 = await a.win.evaluate(
    async ([dir]) => window.electronAPI.saveFile({ dirPath: dir, filename: "mine.txt", data: "clobber" }),
    [s.chosen],
  );
  const va = L.fsSnap(victim);
  say("  answer:", r2);
  say("  before/after:", { ino: [vb.ino, va.ino], sha: [vb.sha256.slice(0, 10), va.sha256 && va.sha256.slice(0, 10)] });
  say("  my notes survived:", L.fsDiff(vb, va).sameBytes === true);
  say("  ' 2' file:", fs.existsSync(path.join(s.chosen, "mine 2.txt")), fs.readdirSync(s.chosen).sort());
  await a.shot("attack-done");
  say("page errors:", a.logs.pageErrors.slice(0, 6));
  const dragLog1 = a.logs.stdout.join("").match(/\[drag\][^\n]*/g);
  say("main-process drag log lines:", dragLog1 || []);
  await a.close();

  // ================================================== PART C — behaviour change
  say("");
  say("================ PART C — is legitimate use now refused?");

  // C1: a folder picked through the native dialog this session
  const s2 = sandbox("picked");
  const brandNew = path.join(s2.root, "Brand New Folder");
  fs.mkdirSync(brandNew, { recursive: true });
  {
    const b = await L.launch({
      label: "d2-picked",
      cwd: stub,
      seed: {
        "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", s2.chosen, path.join(s2.root, "data"), { prefix: "ACM" })],
        "clipper.activeCampaign": "acme-q4",
        "clipper.clipsDir": s2.chosen,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": s2.chosen,
        "clipper.saveDirs": [s2.chosen],
      },
    });
    // replace the native modal (the driver cannot click it: no window manager)
    await b.app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [dir] });
    }, brandNew);
    const before = await b.win.evaluate(
      async ([dir]) => window.electronAPI.saveFile({ dirPath: dir, filename: "before-pick.txt", data: "x" }),
      [brandNew],
    );
    say("C1. write into a never-seen folder BEFORE picking it:", before);
    await b.win.click("#ui-footer-clips").catch(async () => {
      await b.win.evaluate(() => {
        const el = document.querySelector("#ui-footer-clips");
        if (el) el.click();
      });
    });
    await b.win.waitForTimeout(1200);
    say("C1. clipsDir after the pick:", b.state()["clipper.clipsDir"]);
    const after = await b.win.evaluate(
      async ([dir]) => window.electronAPI.saveFile({ dirPath: dir, filename: "after-pick.txt", data: "x" }),
      [brandNew],
    );
    say("C1. write into it AFTER picking it through the dialog:", after);
    say("C1. folder now:", fs.readdirSync(brandNew));
    say("C1. messages:", await L.messages(b.win));
    await b.shot("picked-folder");
    await b.close();
  }

  // C2: a campaign whose clips folder was never the global clipsDir
  const s3 = sandbox("percampaign");
  const campB = path.join(s3.root, "Client B clips");
  fs.mkdirSync(campB, { recursive: true });
  {
    const c = await L.launch({
      label: "d2-percampaign",
      cwd: stub,
      seed: {
        "clipper.campaigns": [
          L.slugCampaign("a", "Client A", s3.chosen, path.join(s3.root, "data-a"), { prefix: "CLA" }),
          L.slugCampaign("b", "Client B", campB, path.join(s3.root, "data-b"), { prefix: "CLB" }),
        ],
        "clipper.activeCampaign": "a",
        "clipper.clipsDir": s3.chosen,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": s3.chosen,
        "clipper.saveDirs": [s3.chosen], // Client B's folder is NOT in the list
      },
    });
    await L.loadVideo(c.win);
    say("C2. saveDirs as seeded:", c.state()["clipper.saveDirs"]);
    // switch to Client B and cut
    await c.win.click("#ui-campaign-chip");
    await c.win.waitForTimeout(300);
    await c.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find(
        (x) => !/^(Edit|Remove)/.test(x.getAttribute("aria-label") || "") && (x.textContent || "").trim().startsWith("Client B"),
      );
      if (b) b.click();
    });
    await c.win.waitForTimeout(900);
    await c.win.keyboard.press("Escape");
    say("C2. after the switch, saveDir on disk:", c.state()["clipper.saveDir"], "| saveDirs:", c.state()["clipper.saveDirs"]);
    const ok = await L.cutOne(c.win, "00:00:02", "00:00:08");
    say("C2. cut finished:", ok, "| messages:", await L.messages(c.win));
    say("C2. Client B's folder now:", fs.readdirSync(campB));
    say("C2. VERDICT:", fs.readdirSync(campB).length ? "the cut landed (PASS)" : "REFUSED (regression)");
    await c.shot("percampaign-cut");
    say("C2. clip log lines:", (c.logs.stdout.join("").match(/\[(clip|file|drag)\][^\n]*/g) || []).slice(0, 8));

    // C3/C4: drag-out of a file inside the folder, and of one whose folder is
    // no longer in settings.
    const clipFile = path.join(campB, fs.readdirSync(campB)[0] || "none");
    const dragIn = await dragProbe(c, clipFile);
    say("C3. startDrag of the clip just saved (inside a known folder):", dragIn);
    const stray = path.join(s3.outside, "stray.mp4");
    fs.writeFileSync(stray, "x");
    const dragOut = await dragProbe(c, stray);
    say("C4. startDrag of a file OUTSIDE every known folder:", dragOut);
    say("C4. drag log lines:", (c.logs.stdout.join("").match(/\[drag\][^\n]*/g) || []));
    // The preload gate means neither call reaches main without a real gesture
    // (D-1's keeper). The main-side containment is therefore exercised at the
    // module level, in the main process, against the real folders.
    const dragMatrix = await c.app.evaluate(
      ({}, [mod, inside, outsideFile, link, missing, roots]) => {
        const { dragTarget } = require(mod);
        const probe = (p) => {
          try {
            return dragTarget(p, roots);
          } catch (e) {
            return `threw ${e.message}`;
          }
        };
        return {
          insideAKnownFolder: probe(inside),
          outsideEveryKnownFolder: probe(outsideFile),
          symlinkInsidePointingOut: probe(link),
          missing: probe(missing),
          relative: probe("relative/path.mp4"),
          theFolderItself: probe(roots[0]),
          withNewline: probe(inside + "\nx"),
          notAString: probe(42),
        };
      },
      [
        path.join(L.REPO, "electron", "pathSafety.cjs"),
        clipFile,
        stray,
        path.join(s3.chosen, "link-to-outside"),
        path.join(campB, "gone.mp4"),
        [campB, s3.chosen],
      ],
    );
    say("C5. dragTarget (product module, in the main process):", dragMatrix);
    await c.close();
  }

  // ================================================== PART D — how wide is the list
  say("");
  say("================ PART D — the allow-list is as wide as clipper.saveDirs");
  const s4 = sandbox("widened");
  const canary4 = path.join(s4.canaryDir, ".bashrc");
  const cb4 = L.fsSnap(canary4);
  {
    const d = await L.launch({
      label: "d2-widened",
      cwd: stub,
      seed: {
        "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", s4.chosen, path.join(s4.root, "data"), { prefix: "ACM" })],
        "clipper.activeCampaign": "acme-q4",
        "clipper.clipsDir": s4.chosen,
        "clipper.dataDirConfirmed": true,
        "clipper.saveDir": s4.chosen,
        // the user once picked the PARENT folder, so it is remembered for ever
        // (D-25: saveDirs collects every folder ever picked and is never pruned)
        "clipper.saveDirs": [s4.chosen, s4.root],
      },
    });
    const r = await d.win.evaluate(
      async ([dir]) => window.electronAPI.saveFile({ dirPath: dir, filename: ".bashrc", data: "PWNED" }),
      [s4.canaryDir],
    );
    say("D. canary write with the parent folder in saveDirs:", r);
    const ca4 = L.fsSnap(canary4);
    say("D. canary:", { ino: [cb4.ino, ca4.ino], size: [cb4.size, ca4.size], contents: ca4.head && ca4.head.trim() });
    say("D. VERDICT:", L.fsDiff(cb4, ca4).sameBytes === true ? "still contained" : "the fix is bypassed by an ordinary earlier pick");
    say("D. folder now:", fs.readdirSync(s4.canaryDir));
    await d.close();
  }

  log.flush();

  async function dragProbe(app, file) {
    // startDrag has no reply, so liveness is measured with the next IPC call.
    const out = await app.win.evaluate(async ([f]) => {
      const t0 = Date.now();
      try {
        window.electronAPI.startDrag(f);
      } catch (e) {
        return { threw: String(e && e.message) };
      }
      const answered = await Promise.race([
        window.electronAPI.fileExists("/etc/hostname"),
        new Promise((r) => setTimeout(() => r("*** NO ANSWER after 8s ***"), 8000)),
      ]);
      return { answered, ms: Date.now() - t0 };
    }, [file]);
    return out;
  }
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
