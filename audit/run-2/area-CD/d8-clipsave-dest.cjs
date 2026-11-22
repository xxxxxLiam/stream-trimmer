/**
 * d8-clipsave-dest.cjs — completes the D-6 containment matrix for `clip:save`.
 *
 * In d2-containment.cjs both hostile `clip:save` calls were refused by the
 * SOURCE check ("Unexpected clip location") before the destination check could
 * run, so the destination half was never exercised there. Here the source is a
 * real file inside a real `ytclip-` folder under the OS temp dir — the only
 * shape the source check accepts — so the call reaches `resolveTarget` and the
 * destination rule is the thing under test.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/d8-clipsave-dest.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "d8");
const log = L.mkLogger(path.join(__dirname, "out", "d8-clipsave-dest.txt"));
const say = log.say;

function freshSource(name = "clip.mp4") {
  const dir = fs.mkdtempSync(path.join(fs.realpathSync(os.tmpdir()), "ytclip-"));
  const f = path.join(dir, name);
  fs.writeFileSync(f, "pretend media\n");
  return f;
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"));
  const chosen = path.join(ROOT, "chosen");
  const outside = path.join(ROOT, "outside");
  const canaryDir = path.join(ROOT, "home-canary");
  const data = path.join(ROOT, "data");
  [chosen, outside, canaryDir, data].forEach((d) => fs.mkdirSync(d, { recursive: true }));
  fs.writeFileSync(path.join(canaryDir, ".bashrc"), "original\n");
  const canaryBefore = L.fsSnap(path.join(canaryDir, ".bashrc"));
  try {
    fs.symlinkSync(outside, path.join(chosen, "link-to-outside"));
  } catch {}

  const a = await L.launch({
    label: "d8-clipsave",
    cwd: stub,
    seed: {
      "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", chosen, data, { prefix: "ACM" })],
      "clipper.activeCampaign": "acme-q4",
      "clipper.clipsDir": chosen,
      "clipper.dataDir": data,
      "clipper.dataDirConfirmed": true,
      "clipper.saveDir": chosen,
      "clipper.saveDirs": [chosen],
    },
  });

  const cases = [
    ["dirPath outside the chosen folders", outside, "stolen.mp4"],
    ["dirPath = the canary folder, dotfile name", canaryDir, ".bashrc"],
    ["dirPath = chosen/..", path.join(chosen, ".."), "up.mp4"],
    ["dirPath through a symlink out of chosen", path.join(chosen, "link-to-outside"), "sym.mp4"],
    ["dirPath = /etc", "/etc", "etc.mp4"],
    ["dirPath relative", "chosen", "rel.mp4"],
    ["filename traversal", chosen, "../../outside/trav.mp4"],
    ["filename ..", chosen, ".."],
    ["CONTROL inside the chosen folder", chosen, "fine.mp4"],
    ["CONTROL inside the data folder", data, "fine-data.mp4"],
  ];
  const treeBefore = L.treeOf(ROOT);
  for (const [name, dir, filename] of cases) {
    const src = freshSource();
    const r = await a.win.evaluate(
      async ([tempPath, dirPath, fn]) => window.electronAPI.saveClip({ tempPath, dirPath, filename: fn }),
      [src, dir, filename],
    );
    say(`  ${name}\n      -> ${JSON.stringify(r)}`);
  }
  const treeAfter = L.treeOf(ROOT);
  const created = treeAfter.filter((p) => !treeBefore.includes(p));
  say("");
  say("paths created in the sandbox:", created);
  say("CREATED OUTSIDE the chosen and data folders:",
    created.filter((p) => !p.startsWith("chosen/") && !p.startsWith("data/")).length
      ? created.filter((p) => !p.startsWith("chosen/") && !p.startsWith("data/"))
      : "none");
  const cd = L.fsDiff(canaryBefore, L.fsSnap(path.join(canaryDir, ".bashrc")));
  say("canary .bashrc unchanged:", cd.sameBytes === true && cd.sameInode === true, cd.after.head && cd.after.head.trim());
  say("clip log lines:", (a.logs.stdout.join("").match(/\[clip\][^\n]*/g) || []).slice(0, 12));
  await a.shot("clipsave-dest");
  say("page errors:", a.logs.pageErrors.slice(0, 4));
  await a.close();
  log.flush();
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
