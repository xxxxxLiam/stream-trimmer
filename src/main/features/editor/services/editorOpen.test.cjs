/**
 * File: editorOpen.test.cjs
 * Path: src/main/features/editor/services/editorOpen.test.cjs
 * Description: Pins editorOpen.ts failure paths with fake fs / exec, so no Mac
 *   or editor is needed. Run: node --test electron/editorOpen.test.cjs
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const ed = require("./editorOpen.ts");

/** A fake fs exposing a tree: { "/Applications": ["Final Cut Pro.app"], ... } */
function fakeFs(tree, files = []) {
  return {
    readdirSync(dir) {
      if (!(dir in tree)) throw new Error("ENOENT");
      return tree[dir];
    },
    existsSync: (p) => files.includes(p),
    statSync: (p) => {
      if (!files.includes(p)) throw new Error("ENOENT");
      return { isFile: () => true, isDirectory: () => false };
    },
  };
}
const mac = { platform: "darwin", home: "/Users/me" };

test("finds Final Cut Pro, CapCut, and the highest versioned Premiere", () => {
  const fsImpl = fakeFs({
    "/Applications": [
      "Final Cut Pro.app",
      "CapCut.app",
      "Adobe Premiere Pro 2024",
      "Adobe Premiere Pro 2025",
    ],
    "/Applications/Adobe Premiere Pro 2024": ["Adobe Premiere Pro 2024.app"],
    "/Applications/Adobe Premiere Pro 2025": ["Adobe Premiere Pro 2025.app", "Other.app"],
  });
  assert.equal(ed.findApp("finalcut", { ...mac, fsImpl }), "/Applications/Final Cut Pro.app");
  assert.equal(ed.findApp("capcut", { ...mac, fsImpl }), "/Applications/CapCut.app");
  assert.equal(
    ed.findApp("premiere", { ...mac, fsImpl }),
    "/Applications/Adobe Premiere Pro 2025/Adobe Premiere Pro 2025.app",
  );
});

test("a missing app is reported by name, with where the file was saved", async () => {
  const fsImpl = fakeFs({ "/Applications": [] }, ["/c/Shorts.fcpxml"]);
  const r = await ed.openWithApp({ app: "finalcut", file: "/c/Shorts.fcpxml" }, { ...mac, fsImpl, exec: () => assert.fail("must not launch") });
  assert.equal(r.ok, false);
  assert.equal(r.missing, "Final Cut Pro");
  assert.match(r.error, /^Final Cut Pro is not installed/);
  assert.match(r.error, /saved at \/c\/Shorts\.fcpxml/);
});

test("an installed app is launched with open -a <app> <file>", async () => {
  const fsImpl = fakeFs({ "/Applications": ["Final Cut Pro.app"] }, ["/c/a.fcpxml"]);
  let call;
  const r = await ed.openWithApp({ app: "finalcut", file: "/c/a.fcpxml" }, {
    ...mac, fsImpl,
    exec: (cmd, args, cb) => { call = [cmd, args]; cb(null, "", ""); },
  });
  assert.equal(r.ok, true);
  assert.deepEqual(call, ["open", ["-a", "/Applications/Final Cut Pro.app", "/c/a.fcpxml"]]);
});

test("open failing surfaces the reason; non-macOS says macOS only", async () => {
  const fsImpl = fakeFs({ "/Applications": ["CapCut.app"] }, []);
  const bad = await ed.openWithApp({ app: "capcut" }, { ...mac, fsImpl, exec: (c, a, cb) => cb(new Error("x"), "", "LSOpenURLsWithRole() failed") });
  assert.equal(bad.ok, false);
  assert.match(bad.error, /CapCut would not open: LSOpenURLsWithRole/);
  const win = await ed.openWithApp({ app: "finalcut", file: "/c/a.fcpxml" }, { platform: "win32" });
  assert.match(win.error, /macOS only/);
  assert.match(win.error, /saved at/);
});

test("only known editors can be launched; the file must exist", async () => {
  assert.match((await ed.openWithApp({ app: "rm -rf /" }, mac)).error, /not one this app can open/);
  const fsImpl = fakeFs({ "/Applications": ["Final Cut Pro.app"] }, []);
  assert.match((await ed.openWithApp({ app: "finalcut", file: "/c/gone.fcpxml" }, { ...mac, fsImpl })).error, /not there any more/);
});

test("probe: no ffprobe and no ffmpeg names both; ffprobe path returns JSON", async () => {
  const none = await ed.probeMedia("/c/a.mp4", { dirs: [], fsImpl: fakeFs({}, ["/c/a.mp4"]) });
  assert.match(none.error, /ffprobe was not found, and neither was ffmpeg/);
  const missing = await ed.probeMedia("/c/a.mp4", { dirs: [], fsImpl: fakeFs({}, []) });
  assert.match(missing.error, /not where it was saved/);
  const fsImpl = fakeFs({}, ["/c/a.mp4", "/bin/ffprobe"]);
  const ok = await ed.probeMedia("/c/a.mp4", { dirs: ["/bin"], fsImpl, exec: (c, a, o, cb) => cb(null, '{"streams":[]}', "") });
  assert.deepEqual(ok, { ok: true, kind: "ffprobe", json: { streams: [] } });
  const onlyFfmpeg = fakeFs({}, ["/c/a.mp4", "/bin/ffmpeg"]);
  const fb = await ed.probeMedia("/c/a.mp4", { dirs: ["/bin"], fsImpl: onlyFfmpeg, exec: (c, a, o, cb) => cb(new Error("exit 1"), "", "  Duration: 00:00:02.00, start") });
  assert.equal(fb.kind, "ffmpeg");
});

test("writeFcpxml writes safely; copyFiles never overwrites", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "editor-"));
  const w = await ed.writeFcpxml({ dirPath: dir, filename: "../evil/Shorts", contents: "<?xml version=\"1.0\"?><fcpxml/>" });
  assert.equal(w.ok, true);
  assert.equal(w.path, path.join(dir, "Shorts.fcpxml"));
  assert.equal((await ed.writeFcpxml({ dirPath: dir, filename: "x", contents: "nope" })).ok, false);
  assert.equal((await ed.writeFcpxml({ dirPath: "relative", filename: "x", contents: "<?xml" })).ok, false);

  const src = path.join(dir, "clip.mp4");
  fs.writeFileSync(src, "a");
  const drop = path.join(dir, "drop");
  const one = await ed.copyFiles({ dirPath: drop, files: [src] });
  const two = await ed.copyFiles({ dirPath: drop, files: [src, path.join(dir, "gone.mp4")] });
  assert.equal(path.basename(one.copied[0]), "clip.mp4");
  assert.equal(path.basename(two.copied[0]), "clip 2.mp4");
  assert.equal(two.failed.length, 1);
});

test("reveal: missing path is named; folder opens; file is shown", async () => {
  const calls = [];
  const shell = { openPath: async (p) => { calls.push(["open", p]); return ""; }, showItemInFolder: (p) => calls.push(["show", p]) };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "editor-"));
  const file = path.join(dir, "a.mp4");
  fs.writeFileSync(file, "x");
  assert.equal((await ed.reveal(dir, { shell })).ok, true);
  assert.equal((await ed.reveal(file, { shell })).ok, true);
  assert.deepEqual(calls, [["open", dir], ["show", file]]);
  const gone = await ed.reveal(path.join(dir, "gone"), { shell });
  assert.match(gone.error, /Nothing is at .*gone/);
});
