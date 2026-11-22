/**
 * d1-overwrite.cjs — D-2 re-verification: does a save still destroy a file of
 * the same name?
 *
 * Three write paths, each with inode + size + sha256 before and after:
 *   1. clip:save   — a real clip cut by real ffmpeg, saved by the product.
 *   2. file:save   — the comments CSV (the same hole, per the brief).
 *   3. export:save / file:saveFiles — the exporter's CSVs into a folder that
 *      already holds a file of that name (T2 flagged this one as NOT changed).
 * Plus the collision run twice over, to see the " 2" / " 3" convention, and a
 * control (an empty folder) so the same drive sequence is known to work.
 *
 * xvfb-run -a --server-args="-screen 0 1440x900x24" node audit/run-2/area-CD/d1-overwrite.cjs
 */
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const L = require("./cdlib.cjs");

const ROOT = path.join(L.SCRATCH, "d1");
const log = L.mkLogger(path.join(__dirname, "out", "d1-overwrite.txt"));
const say = log.say;

const MINE = "the user's own earlier clip - do not destroy me\n";

function probe(f) {
  try {
    return execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", f])
      .toString()
      .trim();
  } catch {
    return "not media";
  }
}

(async () => {
  fs.rmSync(ROOT, { recursive: true, force: true });
  const stub = L.makeStubRoot(path.join(ROOT, "stub"), {
    info: {
      comments: [
        { id: "c1", parent: "root", author: "A", author_id: "ida", text: "first comment", like_count: 3, timestamp: 1700000000 },
        { id: "c2", parent: "c1", author: "B", author_id: "idb", text: "a reply", like_count: 1, timestamp: 1700000100 },
      ],
      comment_count: 2,
    },
  });

  // ---------------------------------------------------- 1. control: empty folder
  say("================ 1. control — cut into an EMPTY folder");
  const cdirC = path.join(ROOT, "clips-control");
  fs.mkdirSync(cdirC, { recursive: true });
  {
    const a = await L.launch({
      label: "d1-control",
      cwd: stub,
      seed: seedFor(cdirC, path.join(ROOT, "data-control")),
    });
    await L.loadVideo(a.win);
    const ok = await L.cutOne(a.win, "00:00:02", "00:00:08");
    say("cut finished:", ok, "| messages:", await L.messages(a.win));
    say("folder now:", fs.readdirSync(cdirC));
    await a.close();
  }

  // ---------------------------------------------------- 2. clip:save collision
  say("");
  say("================ 2. clip:save — a file of that name is already there");
  const cdir = path.join(ROOT, "clips-collide");
  fs.mkdirSync(cdir, { recursive: true });
  const target = path.join(cdir, "ACM-stub0000001-01.mp4");
  fs.writeFileSync(target, MINE);
  const before = L.fsSnap(target);
  say("before:", { ino: before.ino, size: before.size, sha: before.sha256.slice(0, 12), head: before.head.trim() });
  {
    const a = await L.launch({
      label: "d1-clip-collision",
      cwd: stub,
      seed: seedFor(cdir, path.join(ROOT, "data-collide")),
    });
    await L.loadVideo(a.win);
    const ok = await L.cutOne(a.win, "00:00:02", "00:00:08");
    const msgs = await L.messages(a.win);
    say("cut finished:", ok);
    say("messages:", msgs);
    const after = L.fsSnap(target);
    say("after :", { ino: after.ino, size: after.size, sha: after.sha256 && after.sha256.slice(0, 12), head: after.head && after.head.trim() });
    const diff = L.fsDiff(before, after);
    say("VERDICT user's bytes survived:", diff.sameBytes === true && diff.sameInode === true ? "YES (PASS)" : "NO (FAIL)");
    say("  sameInode:", diff.sameInode, "sameSize:", diff.sameSize, "sameBytes:", diff.sameBytes);
    say("folder now:", fs.readdirSync(cdir));
    const second = path.join(cdir, "ACM-stub0000001-01 2.mp4");
    say("' 2' file exists:", fs.existsSync(second), fs.existsSync(second) ? `${L.fsSnap(second).size} bytes, ${probe(second)}s` : "");
    say("the toast names the file that was actually written:", msgs.join(" | ").includes("ACM-stub0000001-01 2.mp4"));
    await a.shot("clip-collision");

    // a THIRD clip with the same id, to see " 3"
    fs.writeFileSync(path.join(cdir, "ACM-stub0000001-02.mp4"), MINE);
    fs.writeFileSync(path.join(cdir, "ACM-stub0000001-02 2.mp4"), MINE);
    const b2 = L.fsSnap(path.join(cdir, "ACM-stub0000001-02.mp4"));
    const b3 = L.fsSnap(path.join(cdir, "ACM-stub0000001-02 2.mp4"));
    await L.dismissToast(a.win);
    const ok2 = await L.cutOne(a.win, "00:00:12", "00:00:18");
    say("second cut finished:", ok2, "| messages:", await L.messages(a.win));
    say("folder now:", fs.readdirSync(cdir).sort());
    say("both earlier -02 files survived:",
      L.fsDiff(b2, L.fsSnap(path.join(cdir, "ACM-stub0000001-02.mp4"))).sameBytes === true &&
      L.fsDiff(b3, L.fsSnap(path.join(cdir, "ACM-stub0000001-02 2.mp4"))).sameBytes === true);
    const third = path.join(cdir, "ACM-stub0000001-02 3.mp4");
    say("' 3' file written:", fs.existsSync(third), fs.existsSync(third) ? `${probe(third)}s` : "");
    say("page errors:", a.logs.pageErrors.slice(0, 4));
    await a.close();
  }

  // ---------------------------------------------------- 3. file:save, comments CSV
  say("");
  say("================ 3. file:save — the comments CSV over an existing file");
  const cdir3 = path.join(ROOT, "clips-csv");
  fs.mkdirSync(cdir3, { recursive: true });
  {
    const a = await L.launch({
      label: "d1-comments-csv",
      cwd: stub,
      seed: seedFor(cdir3, path.join(ROOT, "data-csv")),
    });
    await L.loadVideo(a.win);
    // find the name the export would use, then plant a file there first
    const title = await a.win.evaluate(() => document.title || "");
    const csvName = "Stub video-comments.csv";
    const csvPath = path.join(cdir3, csvName);
    fs.writeFileSync(csvPath, "my own spreadsheet, months of work\n");
    const cb = L.fsSnap(csvPath);
    say("planted:", csvName, { ino: cb.ino, size: cb.size, sha: cb.sha256.slice(0, 12) });
    const btn = await a.win.evaluate(() =>
      Array.from(document.querySelectorAll("button"))
        .map((b) => (b.textContent || "").trim())
        .filter((t) => /comment/i.test(t)),
    );
    say("comment buttons on screen:", btn);
    await a.win.evaluate(() => {
      const b = Array.from(document.querySelectorAll("button")).find((x) => /comment/i.test(x.textContent || ""));
      if (b) b.click();
    });
    await a.win.waitForTimeout(6000);
    say("messages:", await L.messages(a.win));
    const ca = L.fsSnap(csvPath);
    say("after :", { ino: ca.ino, size: ca.size, sha: ca.sha256 && ca.sha256.slice(0, 12), head: ca.head && ca.head.slice(0, 60) });
    const d = L.fsDiff(cb, ca);
    say("VERDICT the user's CSV survived:", d.sameBytes === true && d.sameInode === true ? "YES (PASS)" : "NO (FAIL)");
    say("folder now:", fs.readdirSync(cdir3).sort());
    say("' 2' CSV written:", fs.existsSync(path.join(cdir3, "Stub video-comments 2.csv")));
    await a.shot("comments-csv");
    say("page errors:", a.logs.pageErrors.slice(0, 4));
    await a.close();
  }

  // ---------------------------------------------------- 4. saveFiles / export:save
  say("");
  say("================ 4. file:saveFiles — a CSV name already taken in the target folder");
  const cdir4 = path.join(ROOT, "clips-export");
  fs.mkdirSync(cdir4, { recursive: true });
  {
    const a = await L.launch({
      label: "d1-savefiles",
      cwd: stub,
      seed: seedFor(cdir4, path.join(ROOT, "data-export")),
    });
    const folder = path.join(cdir4, "an-export-folder");
    fs.mkdirSync(folder, { recursive: true });
    const victim = path.join(folder, "videos.csv");
    fs.writeFileSync(victim, "the export I did yesterday and still need\n");
    const vb = L.fsSnap(victim);
    say("planted:", victim.replace(ROOT, "<root>"), { ino: vb.ino, size: vb.size, sha: vb.sha256.slice(0, 12) });
    const res = await a.win.evaluate(
      async ([dir]) =>
        window.electronAPI.saveFiles({
          dirPath: dir,
          folder: "an-export-folder",
          files: [{ name: "videos.csv", contents: "overwritten by the new run\n" }],
        }),
      [cdir4],
    );
    say("file:saveFiles answered:", res);
    const va = L.fsSnap(victim);
    say("after :", { ino: va.ino, size: va.size, sha: va.sha256 && va.sha256.slice(0, 12), head: va.head && va.head.trim() });
    const d = L.fsDiff(vb, va);
    say("VERDICT yesterday's CSV survived:", d.sameBytes === true ? "YES" : "NO — overwritten");
    say("folder now:", fs.readdirSync(folder).sort());
    say("page errors:", a.logs.pageErrors.slice(0, 4));
    await a.close();
  }

  log.flush();

  function seedFor(clips, data) {
    fs.mkdirSync(data, { recursive: true });
    return {
      "clipper.campaigns": [L.slugCampaign("acme-q4", "Acme Q4", clips, data, { prefix: "ACM" })],
      "clipper.activeCampaign": "acme-q4",
      "clipper.clipsDir": clips,
      "clipper.dataDir": data,
      "clipper.dataDirConfirmed": true,
      "clipper.saveDir": clips,
      "clipper.saveDirs": [clips],
    };
  }
})().catch((e) => {
  say("SCRIPT FAILED: " + String(e.stack || e));
  log.flush();
  process.exit(1);
});
