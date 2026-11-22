/**
 * slice-2 verification of D-6 (`file:save` writes to any absolute path) and
 * D-7 (`file:saveFiles` with folder ".." writes outside the chosen folder),
 * plus the one question the slice brief asks: are they one hole or two?
 *
 * Every write is made from the renderer through the product's own preload
 * bridge, with the app configured so `chosen/` is the folder the user picked.
 * The canary outside that folder is snapshotted (inode + size + sha256) before
 * and after, so "it was overwritten" is a filesystem fact.
 *
 * Usage: xvfb-run -a --server-args="-screen 0 1440x900x24" \
 *          node audit/run-1/verify/slice-2/v-d67-paths.cjs [tag]
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { makeStubRoot } = require("./vlib.cjs");
const vapp = require("./vapp.cjs");

const TAG = process.argv[2] || "a";
const OUT = path.join(__dirname, "out", `d67-${TAG}`);

function tree(root) {
  const out = [];
  const walk = (dir, rel) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        out.push(r + "/");
        walk(p, r);
      } else {
        out.push(r);
      }
    }
  };
  walk(root, "");
  return out.sort();
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });

  const sand = fs.mkdtempSync(path.join(os.tmpdir(), `v-d67-${TAG}-`));
  const chosen = path.join(sand, "chosen");
  const outside = path.join(sand, "outside");
  const canaryDir = path.join(sand, "home-canary");
  fs.mkdirSync(chosen, { recursive: true });
  fs.mkdirSync(outside, { recursive: true });
  fs.mkdirSync(canaryDir, { recursive: true });
  const canary = path.join(canaryDir, ".bashrc");
  fs.writeFileSync(canary, "original\n");
  const canaryBefore = vapp.fsSnapshot(canary);
  const treeBefore = tree(sand);

  const stub = path.join(sand, "stub");
  fs.mkdirSync(stub, { recursive: true });
  makeStubRoot(stub, {});

  const a = await vapp.launch({
    label: `d67-${TAG}`,
    outDir: OUT,
    cwd: stub,
    seed: {
      "clipper.campaigns": [
        {
          id: "c1",
          name: "Audit D",
          targetMinSec: 1,
          targetMaxSec: 600,
          hardMaxSec: 600,
          clipIdPattern: "{prefix}-{videoId}-{nn}",
          prefix: "AUD",
          format: "mp4",
          quality: "360",
          clipsDir: chosen,
          dataDir: path.join(sand, "data"),
          usedRanges: {},
        },
      ],
      "clipper.activeCampaign": "c1",
      "clipper.clipsDir": chosen,
      "clipper.saveDir": chosen,
      "clipper.dataDir": path.join(sand, "data"),
      "clipper.dataDirConfirmed": true,
    },
  });

  const calls = await a.win.evaluate(async (p) => {
    const api = window.electronAPI;
    const out = [];
    const run = async (name, fn) => {
      try {
        out.push({ name, result: await fn() });
      } catch (e) {
        out.push({ name, threw: String(e) });
      }
    };
    // D-6: dirPath is never checked against anything
    await run("D6 file:save absolute dirPath outside chosen (canary dotfile)", () =>
      api.saveFile({ dirPath: p.canaryDir, filename: ".bashrc", data: "PWNED" }),
    );
    await run("D6 file:save absolute dirPath outside chosen (plain file)", () =>
      api.saveFile({ dirPath: p.outside, filename: "pwned-abs.txt", data: "x" }),
    );
    await run("D6 control: filename traversal inside chosen", () =>
      api.saveFile({ dirPath: p.chosen, filename: "../../outside/pwned-save.txt", data: "x" }),
    );
    await run("D6 file:save dirPath that does not exist yet", () =>
      api.saveFile({ dirPath: p.sand + "/made/up/deep", filename: "made.txt", data: "x" }),
    );
    // D-7: folder is sanitised for separators only
    await run('D7 file:saveFiles folder=".."', () =>
      api.saveFiles({ dirPath: p.chosen, folder: "..", files: [{ name: "esc.csv", contents: "x" }] }),
    );
    await run('D7 file:saveFiles folder="../.."', () =>
      api.saveFiles({ dirPath: p.chosen, folder: "../..", files: [{ name: "esc2.csv", contents: "x" }] }),
    );
    await run('D7 control: folder="../outside"', () =>
      api.saveFiles({ dirPath: p.chosen, folder: "../outside", files: [{ name: "contained.csv", contents: "x" }] }),
    );
    await run('D7 control: folder="ok"', () =>
      api.saveFiles({ dirPath: p.chosen, folder: "ok", files: [{ name: "fine.csv", contents: "x" }] }),
    );
    // for the duplicate question: does saveFiles ALSO take an absolute dirPath?
    await run("D7/D6 overlap: file:saveFiles absolute dirPath outside chosen", () =>
      api.saveFiles({ dirPath: p.outside, folder: "sf", files: [{ name: "pwned-sf.csv", contents: "x" }] }),
    );
    return out;
  }, { sand, chosen, outside, canaryDir });

  await a.shot("after-hostile-calls");
  const canaryAfter = vapp.fsSnapshot(canary);
  const treeAfter = tree(sand);
  await a.close();

  const created = treeAfter.filter((f) => !treeBefore.includes(f));
  const result = {
    tag: TAG,
    sandbox: sand,
    calls,
    canary: vapp.fsCompare(canaryBefore, canaryAfter),
    canaryContentsNow: fs.existsSync(canary) ? fs.readFileSync(canary, "utf8") : null,
    createdPaths: created,
    createdOutsideChosen: created.filter((f) => !f.startsWith("chosen/") && !f.startsWith("stub/")),
    escCsvInSandboxRoot: fs.existsSync(path.join(sand, "esc.csv")),
    escCsvOneLevelUp: fs.existsSync(path.join(path.dirname(sand), "esc2.csv")),
  };
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
