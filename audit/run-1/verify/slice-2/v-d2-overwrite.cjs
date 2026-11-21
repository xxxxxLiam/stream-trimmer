/**
 * slice-2 verification of D-2 ("saving a clip silently overwrites a file of the
 * same name, and still says Clip saved") and, in the same cold run, D-10
 * ("losing the target folder mid-download surfaces a raw Node stack trace").
 *
 * Written from the findings' Steps. Each part is a COLD START: its own
 * user-data dir, its own clips folder, its own stub root.
 *
 * The overwrite claim is settled on the filesystem, not in the UI: the
 * pre-existing file's inode, size, mtime and sha256 are recorded before the
 * cut and again after it.
 *
 * Usage: xvfb-run -a --server-args="-screen 0 1440x900x24" \
 *          node audit/run-1/verify/slice-2/v-d2-overwrite.cjs [tag] [part]
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const { makeStubRoot } = require("./vlib.cjs");
const vapp = require("./vapp.cjs");

const TAG = process.argv[2] || "a";
const ONLY = process.argv[3] || "";
const OUTROOT = path.join(__dirname, "out", `d2-${TAG}`);
const URL = "https://www.youtube.com/watch?v=stub0000001";
const FFPROBE = "/usr/bin/ffprobe";

const CAMPAIGN = (clipsDir, dataDir) => ({
  id: "camp-audit",
  name: "Audit D",
  targetMinSec: 1,
  targetMaxSec: 600,
  hardMaxSec: 600,
  clipIdPattern: "{prefix}-{videoId}-{nn}",
  prefix: "AUD",
  format: "mp4",
  quality: "360",
  clipsDir,
  dataDir,
  usedRanges: {},
});

const seedFor = (clipsDir, dataDir) => ({
  "clipper.campaigns": [CAMPAIGN(clipsDir, dataDir)],
  "clipper.activeCampaign": "camp-audit",
  "clipper.clipsDir": clipsDir,
  "clipper.saveDir": clipsDir,
  "clipper.dataDir": dataDir,
  "clipper.dataDirConfirmed": true,
  "clipper.downloads": [],
});

function probeFile(f) {
  const r = spawnSync(FFPROBE, ["-v", "error", "-show_entries", "format=duration,size", "-of", "json", f], { encoding: "utf8" });
  try {
    return JSON.parse(r.stdout).format;
  } catch {
    return { error: (r.stderr || "").trim().split("\n")[0] };
  }
}

function freshRoot(name) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `v-d2-${name}-`));
  const clips = path.join(root, "Clips");
  const data = path.join(root, "channel-data");
  fs.mkdirSync(clips, { recursive: true });
  fs.mkdirSync(data, { recursive: true });
  const stub = path.join(root, "stub");
  fs.mkdirSync(stub, { recursive: true });
  makeStubRoot(stub, { argvLog: true });
  return { root, clips, data, stub };
}

/** Part 1 (control): nothing in the way. The clip should simply be written. */
async function partControl() {
  const { clips, data, stub } = freshRoot("control");
  const target = path.join(clips, "AUD-stub0000001-01.mp4");
  const a = await vapp.launch({
    label: `d2-${TAG}/control`,
    cwd: stub,
    seed: seedFor(clips, data),
  });
  const sawToast = await vapp.cutOne(a.win, { url: URL, inTc: "00:00:02", outTc: "00:00:08" });
  const messages = await vapp.visibleMessages(a.win);
  const stitched = await a.win.evaluate(() => document.querySelector("#ui-stitched-total")?.textContent ?? null);
  await a.shot("control-after-cut");
  const after = vapp.fsSnapshot(target);
  await a.close();
  return {
    part: "1-control-no-collision",
    sawToast,
    stitchedTotalShown: stitched,
    messages,
    clipsFolder: fs.readdirSync(clips),
    targetAfter: after,
    probe: after.exists ? probeFile(target) : null,
  };
}

/** Part 2: a file of that exact name is already there. Does it survive? */
async function partCollision() {
  const { clips, data, stub } = freshRoot("collision");
  const target = path.join(clips, "AUD-stub0000001-01.mp4");
  const usersBytes = "the user's own earlier clip - do not destroy me\n"; // 48 bytes
  fs.writeFileSync(target, usersBytes);
  const before = vapp.fsSnapshot(target);
  const beforeProbe = probeFile(target);

  const a = await vapp.launch({
    label: `d2-${TAG}/collision`,
    cwd: stub,
    seed: seedFor(clips, data),
  });
  await a.shot("collision-booted");
  const sawToast = await vapp.cutOne(a.win, { url: URL, inTc: "00:00:02", outTc: "00:00:08" });
  const messages = await vapp.visibleMessages(a.win);
  await a.shot("collision-after-cut");
  const after = vapp.fsSnapshot(target);
  const listing = fs.readdirSync(clips);
  await a.close();
  return {
    part: "2-collision",
    usersFileBytes: usersBytes.length,
    sawToast,
    messages,
    anyMessageMentionsReplacing: messages.some((m) =>
      /replac|overwrit|already exist|renam/i.test(m),
    ),
    clipsFolder: listing,
    madeASecondFile: listing.some((f) => / 2\.mp4$|\(1\)\.mp4$/.test(f)),
    file: vapp.fsCompare(before, after),
    probeBefore: beforeProbe,
    probeAfter: after.exists ? probeFile(target) : null,
    usersBytesStillThere: after.exists && after.head === usersBytes,
  };
}

/**
 * Part 3 (D-10): the clips folder disappears while the download is in flight.
 * The stub is slowed so the folder can be removed mid-flight.
 */
async function partFolderLost() {
  const { clips, data, stub } = freshRoot("folderlost");
  fs.writeFileSync(path.join(stub, "stub.json"), JSON.stringify({ delayMs: 4000, argvLog: true }, null, 2));
  const a = await vapp.launch({
    label: `d2-${TAG}/folder-lost`,
    cwd: stub,
    seed: seedFor(clips, data),
  });
  await vapp.loadVideo(a.win, URL);
  const marks = await vapp.mark(a.win, "00:00:20", "00:00:26");
  await a.win.click("#ui-add-segment");
  await a.win.click("#ui-cut");
  // Remove the folder while the engine is still working.
  await new Promise((r) => setTimeout(r, 2500));
  fs.rmSync(clips, { recursive: true, force: true });
  const removedAt = Date.now();
  const sawSomething = await a.win
    .waitForFunction(
      () =>
        Array.from(document.querySelectorAll('[role="alert"],[role="status"]')).some((n) =>
          /Clip saved|Error|ENOENT|could not|failed/i.test(n.textContent || ""),
        ),
      null,
      { timeout: 120000 },
    )
    .then(() => true)
    .catch(() => false);
  const messages = await vapp.visibleMessages(a.win);
  await a.shot("folder-lost");
  // Is the app recoverable? Put the folder back and cut the same range again.
  fs.mkdirSync(clips, { recursive: true });
  fs.writeFileSync(path.join(stub, "stub.json"), JSON.stringify({ argvLog: true }, null, 2));
  let recovered = false;
  let recoveryMessages = [];
  try {
    await vapp.mark(a.win, "00:00:20", "00:00:26");
    await a.win.click("#ui-add-segment");
    await a.win.click("#ui-cut");
    recovered = await a.win
      .waitForFunction(
        () =>
          Array.from(document.querySelectorAll('[role="status"],[role="alert"]')).some((n) =>
            /Clip saved/i.test(n.textContent || ""),
          ),
        null,
        { timeout: 90000 },
      )
      .then(() => true)
      .catch(() => false);
    recoveryMessages = await vapp.visibleMessages(a.win);
    await a.shot("folder-lost-recovery");
  } catch (e) {
    recoveryMessages = [`driver error: ${String(e).slice(0, 200)}`];
  }
  const recoveredListing = fs.existsSync(clips) ? fs.readdirSync(clips) : [];
  const tempLeftovers = fs
    .readdirSync(os.tmpdir())
    .filter((f) => f.startsWith("ytclip-"))
    .map((f) => ({ dir: f, contents: (() => { try { return fs.readdirSync(path.join(os.tmpdir(), f)); } catch { return "<gone>"; } })() }));
  await a.close();
  return {
    part: "3-folder-lost-mid-download",
    marksThatStuck: marks,
    removedAt,
    sawSomething,
    messages,
    folderRecreated: fs.existsSync(clips),
    messageLooksLikeAStackTrace: messages.some((m) => /ENOENT|at async|node:internal|rename '/.test(m)),
    rawErrorText: messages.find((m) => /ENOENT|at async/.test(m)) || null,
    recoveredAfterRecreatingFolder: recovered,
    recoveryMessages,
    recoveredListing,
    tempLeftovers,
  };
}

(async () => {
  fs.mkdirSync(OUTROOT, { recursive: true });
  const out = [];
  const want = (n) => !ONLY || ONLY === String(n);
  if (want(1)) out.push(await partControl());
  if (want(2)) out.push(await partCollision());
  if (want(3)) out.push(await partFolderLost());
  fs.writeFileSync(path.join(OUTROOT, "results.json"), JSON.stringify(out, null, 2));
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
