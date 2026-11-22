#!/usr/bin/env node
/**
 * G area, audit-only. State over time:
 *   - settings.json that is invalid JSON / empty / an array / huge
 *   - work folders left by an older shape of the resume cache
 * and whether the server boots and behaves in each case.
 *
 * Run: npx tsx audit/run-1/area-G/g8-state.cjs
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const S = require("./srv.cjs");

const OUT = path.join(__dirname, "out-g8");
const out = {};
const log = (...a) => console.log(...a);
const { createSettingsStore } = require(path.join(S.REPO, "electron", "settingsStore.cjs"));

async function section(name, fn) {
  log(`\n\n=== ${name} ===`);
  try { out[name] = await fn(); } catch (e) { out[name] = { FATAL: String(e.message) }; log("  ERROR", e.message); }
}

const DL = (segs, extra = {}) => ({ url: S.YT, deliver: "path", quality: "360", format: "mp4", segments: segs, ...extra });

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const stub = S.makeStub("g8");

  // ---------------------------------------------------------------- 1
  await section("settings.json in bad shapes: does the store survive, and at what cost", async () => {
    const SAVED = {
      "clipper.clipsDir": "/home/someone/Clips",
      "clipper.bank": [{ id: "a", label: "a clip the user saved" }, { id: "b", label: "another" }],
      "clipper.campaigns": [{ id: "c1", name: "Launch week" }],
      "clipper.saveDirNames": { "/home/someone/Clips": "Clips" },
    };
    const cases = [
      ["valid object with real data", JSON.stringify(SAVED, null, 2)],
      ["empty file", ""],
      ["whitespace only", "   \n  "],
      ["invalid JSON (trailing comma)", '{"clipper.bank":[1,2,],}'],
      ["invalid JSON (truncated mid-write)", JSON.stringify(SAVED).slice(0, 60)],
      ["a JSON array", JSON.stringify([SAVED])],
      ["a JSON string", '"hello"'],
      ["a JSON number", "42"],
      ["JSON null", "null"],
      ["valid object, BOM prefixed", "﻿" + JSON.stringify(SAVED)],
      ["valid object + trailing junk", JSON.stringify(SAVED) + "\n}}}garbage"],
      ["2MB bank", JSON.stringify({ ...SAVED, "clipper.bank": Array.from({ length: 20000 }, (_, i) => ({ id: "x" + i, label: "y".repeat(80) })) })],
    ];
    const rows = [];
    for (const [name, text] of cases) {
      const dir = fs.mkdtempSync(path.join(OUT, "udd-"));
      const file = path.join(dir, "settings.json");
      fs.writeFileSync(file, text);
      const bytesBefore = fs.statSync(file).size;
      const store = createSettingsStore(file);
      let loaded, threw = null;
      try { loaded = store.load(); } catch (e) { threw = String(e.message); }
      const keysAfterLoad = loaded ? Object.keys(loaded).length : null;
      const bankAfterLoad = loaded ? (Array.isArray(loaded["clipper.bank"]) ? loaded["clipper.bank"].length : null) : null;
      // The very next ordinary write is what decides whether the file on disk
      // is recovered, left alone, or replaced.
      let setOk = null, onDiskAfterSet = null, bankOnDiskAfterSet = null;
      try {
        setOk = store.set("clipper.dataDirConfirmed", true);
        const raw = fs.readFileSync(file, "utf8");
        onDiskAfterSet = raw.length > 300 ? raw.slice(0, 300) + "..." : raw;
        try { const j = JSON.parse(raw); bankOnDiskAfterSet = Array.isArray(j["clipper.bank"]) ? j["clipper.bank"].length : null; } catch { bankOnDiskAfterSet = "<<unparsable>>"; }
      } catch (e) { setOk = `threw: ${e.message}`; }
      const backups = fs.readdirSync(dir).filter((f) => f !== "settings.json");
      const row = {
        name, bytesBefore, threw, keysAfterLoad, bankAfterLoad, setOk,
        bankOnDiskAfterSet, backupsKept: backups,
        dataLost: bankAfterLoad === null && /bank/.test(text) && bytesBefore > 0,
      };
      rows.push(row);
      log(`  ${name.padEnd(36)} load=${threw ? "THREW " + threw : "ok"} keys=${keysAfterLoad} bank=${bankAfterLoad} afterSet.bank=${bankOnDiskAfterSet} backups=${JSON.stringify(backups)}`);
    }
    log(`  >>> no case threw on load: ${rows.every((r) => !r.threw)}`);
    log(`  >>> cases where saved data was dropped and nothing was backed up: ${rows.filter((r) => r.dataLost).map((r) => r.name).join(", ") || "none"}`);
    return rows;
  });

  // ---------------------------------------------------------------- 2
  await section("server boots with a bad settings.json present", async () => {
    // The server never reads settings.json; prove it rather than assume it.
    const dir = fs.mkdtempSync(path.join(OUT, "udd2-"));
    fs.writeFileSync(path.join(dir, "settings.json"), "{not json at all");
    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub, env: { ELECTRON_USER_DATA: dir } });
    const r = {
      booted: true,
      info: (await s.json("POST", "/api/info", { url: S.YT })).status,
      cache: (await s.req("GET", "/api/cache/usage")).status,
      serverMentionsSettings: /settings\.json/.test(s.log()),
    };
    log(`  ${JSON.stringify(r)}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 3
  await section("work folders from an older/odd shape of the resume cache", async () => {
    const plant = {};
    const mk = (name, build) => {
      const d = path.join(os.tmpdir(), `ytclip-${name}`);
      fs.rmSync(d, { recursive: true, force: true });
      fs.mkdirSync(d, { recursive: true });
      build(d);
      plant[name] = d;
      return d;
    };
    mk("OLDSHAPE-flatfiles", (d) => {              // v3: clip written at the dir root with a different name
      fs.writeFileSync(path.join(d, "out.mp4"), Buffer.alloc(2048));
      fs.writeFileSync(path.join(d, "meta.json"), JSON.stringify({ version: 1, start: 0, end: 5 }));
    });
    mk("OLDSHAPE-dir-named-clip", (d) => {         // type confusion: clip.mp4 is a directory
      fs.mkdirSync(path.join(d, "clip.mp4"));
      fs.writeFileSync(path.join(d, "clip.mp4", "inner"), "x");
    });
    mk("OLDSHAPE-nested", (d) => {                 // deeply nested leftovers
      let p = d;
      for (let i = 0; i < 8; i++) { p = path.join(p, "lvl" + i); fs.mkdirSync(p); }
      fs.writeFileSync(path.join(p, "deep.part"), Buffer.alloc(4096));
    });
    mk("OLDSHAPE-bad-json", (d) => {
      fs.writeFileSync(path.join(d, "state.json"), "{broken");
      fs.writeFileSync(path.join(d, "rows.jsonl"), '{"a":1}\n{"b":2\n');   // truncated last line
    });
    mk("OLDSHAPE-complete-part", (d) => {          // a .part that is actually a whole valid mp4
      fs.copyFileSync(path.join(S.REPO, "audit", "fixtures", "fixture.mp4"), path.join(d, "clip.mp4.part"));
    });
    const symlinkTarget = path.join(OUT, "outside-the-cache.txt");
    fs.writeFileSync(symlinkTarget, "a file that lives outside the cache\n");
    mk("OLDSHAPE-symlink", (d) => {
      try { fs.symlinkSync(symlinkTarget, path.join(d, "link-to-outside")); } catch { /* no symlink support */ }
    });

    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub });
    const r = { planted: Object.keys(plant) };
    r.usage = (await s.req("GET", "/api/cache/usage")).body;
    // Does a normal download still work with all this in the temp dir?
    const d = await s.json("POST", "/api/download?jobId=job_oldshape", DL([{ start: 0, end: 2 }]));
    r.downloadStatus = d.status;
    r.downloadBody = (d.body || "").slice(0, 200);
    // Clear, then check every planted folder and the outside file.
    const cleared = await s.json("POST", "/api/cache/clear", {});
    r.clear = cleared.body;
    r.survivors = Object.entries(plant).filter(([, p]) => fs.existsSync(p)).map(([k]) => k);
    r.outsideFileStillThere = fs.existsSync(symlinkTarget);
    r.outsideFileContent = r.outsideFileStillThere ? fs.readFileSync(symlinkTarget, "utf8").trim() : null;
    r.usageAfterClear = (await s.req("GET", "/api/cache/usage")).body;
    r.serverStillAnswers = (await s.json("POST", "/api/info", { url: S.YT })).status;
    log(`  ${JSON.stringify(r, null, 1)}`);
    await s.stop();
    return r;
  });

  // ---------------------------------------------------------------- 4
  await section("server boots twice in a row / stale sweep on boot", async () => {
    const old = path.join(os.tmpdir(), "ytclip-STALE-eightdays");
    fs.rmSync(old, { recursive: true, force: true });
    fs.mkdirSync(old, { recursive: true });
    fs.writeFileSync(path.join(old, "clip.mp4.part"), Buffer.alloc(1024));
    const eightDaysAgo = new Date(Date.now() - 8 * 24 * 3600 * 1000);
    fs.utimesSync(old, eightDaysAgo, eightDaysAgo);
    const fresh = path.join(os.tmpdir(), "ytclip-FRESH-today");
    fs.rmSync(fresh, { recursive: true, force: true });
    fs.mkdirSync(fresh, { recursive: true });
    fs.writeFileSync(path.join(fresh, "clip.mp4.part"), Buffer.alloc(1024));

    S.setStub(stub, { info: { id: "stub0000001", title: "Stub", duration: 30 } });
    const s = await S.start({ stub });
    await new Promise((x) => setTimeout(x, 800));
    const r = {
      sweptLine: (s.log().split("\n").find((l) => /swept/.test(l)) || "").trim(),
      staleRemoved: !fs.existsSync(old),
      freshKept: fs.existsSync(fresh),
    };
    log(`  ${JSON.stringify(r)}`);
    await s.stop();
    fs.rmSync(fresh, { recursive: true, force: true });
    return r;
  });

  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
  log(`\n\nresults: ${path.join(OUT, "results.json")}`);
  log("SUMMARY-DONE");
})().catch((e) => { console.error("FATAL", e); process.exit(1); });
