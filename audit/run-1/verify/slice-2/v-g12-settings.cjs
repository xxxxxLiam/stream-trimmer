/**
 * slice-2 verification of G-12 ("a settings.json that fails to parse is
 * silently replaced with an empty one; the clip bank, campaigns and folders go
 * with no message and no backup").
 *
 * Part 1 drives the product module electron/settingsStore.cjs directly, with
 * the file's inode, size and sha256 recorded before and after, and the whole
 * data directory listed afterwards so "no backup" is a measurement.
 * Part 2 is the thing the original finding did NOT do: put one of those files
 * in front of the REAL app at a cold start and see whether the user's bank
 * survives a session. The only write is through the product's own
 * settings:set bridge, i.e. what any ordinary UI action does.
 *
 * Usage: xvfb-run -a --server-args="-screen 0 1440x900x24" \
 *          node audit/run-1/verify/slice-2/v-g12-settings.cjs [tag]
 */
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { createSettingsStore } = require("/home/user/stream-trimmer/electron/settingsStore.cjs");
const { makeStubRoot } = require("./vlib.cjs");
const vapp = require("./vapp.cjs");

const TAG = process.argv[2] || "a";
const OUT = path.join(__dirname, "out", `g12-${TAG}`);

const REAL = {
  "clipper.bank": [
    { id: "AUD-01", label: "the hook", segments: [{ start: 1, end: 9 }] },
    { id: "AUD-02", label: "the turn", segments: [{ start: 20, end: 31 }] },
  ],
  "clipper.campaigns": [{ id: "c1", name: "Audit", prefix: "AUD", clipsDir: "/tmp/Clips" }],
  "clipper.clipsDir": "/tmp/Clips",
  "clipper.saveDirNames": { "/tmp/Clips": "Delivery" },
  "clipper.activeCampaign": "c1",
  "clipper.downloads": [{ kind: "clip", label: "AUD-01.mp4", path: "/tmp/Clips/AUD-01.mp4" }],
};
const bigBank = () =>
  Array.from({ length: 20000 }, (_, i) => ({
    id: `AUD-${i}`,
    label: `row ${i}`,
    segments: [{ start: i, end: i + 3 }],
  }));

function shapes() {
  const valid = JSON.stringify(REAL, null, 2);
  return [
    { name: "valid object with real data", text: valid },
    { name: "invalid JSON (trailing comma)", text: valid.replace(/\n}\s*$/, ",\n}") },
    { name: "invalid JSON (truncated write)", text: valid.slice(0, Math.floor(valid.length * 0.6)) },
    { name: "a JSON array", text: JSON.stringify([REAL]) },
    { name: "valid object, BOM prefixed", text: "﻿" + valid },
    { name: "valid object + trailing junk", text: valid + "\n{partial-append" },
    { name: "empty file", text: "" },
    { name: "whitespace only", text: "   \n\t\n" },
    { name: "the literal null", text: "null" },
    { name: "a JSON string", text: '"hi"' },
    { name: "a number", text: "42" },
    {
      name: "2MB bank (20000 rows)",
      text: JSON.stringify({ ...REAL, "clipper.bank": bigBank() }),
    },
  ];
}

const snap = (f) => {
  try {
    const st = fs.statSync(f);
    return {
      exists: true,
      ino: st.ino,
      size: st.size,
      sha256: crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 16),
    };
  } catch (e) {
    return { exists: false, why: String(e.code || e.message) };
  }
};
const bankLen = (o) => (o && Array.isArray(o["clipper.bank"]) ? o["clipper.bank"].length : null);

function part1() {
  const rows = [];
  for (const s of shapes()) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v-g12-"));
    const file = path.join(dir, "settings.json");
    fs.writeFileSync(file, s.text);
    const before = snap(file);
    const row = { shape: s.name, bytesIn: Buffer.byteLength(s.text), before };
    try {
      const store = createSettingsStore(file);
      const loaded = store.load();
      row.loadThrew = false;
      row.keysAfterLoad = Object.keys(loaded).length;
      row.bankAfterLoad = bankLen(loaded);
      row.fileAfterLoad = snap(file);
      // the first write any session does
      row.setOk = store.set("clipper.dataDirConfirmed", true);
    } catch (e) {
      row.loadThrew = String(e && e.message);
    }
    row.after = snap(file);
    let onDisk = null;
    try {
      onDisk = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (e) {
      onDisk = { parseError: String(e.message) };
    }
    row.bankOnDiskAfterSet = bankLen(onDisk);
    row.keysOnDiskAfterSet = onDisk && !onDisk.parseError ? Object.keys(onDisk).length : null;
    row.dirListing = fs.readdirSync(dir);
    row.backups = fs.readdirSync(dir).filter((f) => f !== "settings.json");
    row.userDataSurvived = row.bankOnDiskAfterSet === bankLen(REAL) || row.bankOnDiskAfterSet === 20000;
    row.replacedOnDisk = before.exists && row.after.exists && before.sha256 !== row.after.sha256;
    rows.push(row);
    fs.rmSync(dir, { recursive: true, force: true });
  }
  return { part: "1-module", rows };
}

async function part2() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), `v-g12-app-${TAG}-`));
  const userDataDir = path.join(root, "userData");
  fs.mkdirSync(userDataDir, { recursive: true });
  const stub = path.join(root, "stub");
  fs.mkdirSync(stub, { recursive: true });
  makeStubRoot(stub, {});

  // A BOM is what a Windows text editor adds on save: the JSON is otherwise
  // intact and fully recoverable by hand.
  const corrupt = "﻿" + JSON.stringify(REAL, null, 2);
  const file = path.join(userDataDir, "settings.json");
  const before = { snap: null, text: corrupt };
  const a = await vapp.launch({
    label: `g12-${TAG}-app`,
    outDir: OUT,
    cwd: stub,
    userDataDir,
    rawSettings: corrupt,
  });
  before.snap = snap(file); // after launch: has the boot already rewritten it?
  const rightAfterBoot = { snap: snap(file), raw: a.rawState() };
  // one ordinary persisted action, through the product's own bridge
  const setResult = await a.win.evaluate(() =>
    window.electronAPI.setSetting("clipper.dataDirConfirmed", true),
  );
  await a.win.waitForTimeout(1500);
  const afterSet = { snap: snap(file), raw: a.rawState() };
  await a.shot("after-corrupt-settings");
  const userDataListing = fs.readdirSync(userDataDir);
  await a.close();
  const afterClose = { snap: snap(file), raw: (() => { try { return fs.readFileSync(file, "utf8"); } catch { return null; } })() };
  const parse = (t) => {
    try {
      return JSON.parse(t);
    } catch {
      return null;
    }
  };
  return {
    part: "2-real-app-cold-start",
    userDataDir,
    seededBytes: Buffer.byteLength(corrupt),
    seededBankRows: bankLen(REAL),
    rightAfterBoot: {
      snap: rightAfterBoot.snap,
      bank: bankLen(parse(rightAfterBoot.raw || "")),
      stillTheUsersFile: (rightAfterBoot.raw || "").startsWith("﻿"),
    },
    setResult,
    afterOneSetSetting: {
      snap: afterSet.snap,
      bank: bankLen(parse(afterSet.raw || "")),
      keys: Object.keys(parse(afterSet.raw || "") || {}),
      firstBytes: (afterSet.raw || "").slice(0, 120),
    },
    afterClose: {
      snap: afterClose.snap,
      bank: bankLen(parse(afterClose.raw || "")),
      keys: Object.keys(parse(afterClose.raw || "") || {}),
    },
    userDataListing,
    backupsAnywhere: userDataListing.filter((f) => /bak|corrupt|old|~|\.tmp$/i.test(f)),
    usersDataGone: bankLen(parse(afterClose.raw || "")) === null,
  };
}

(async () => {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(OUT, { recursive: true });
  const out = [part1(), await part2()];
  fs.writeFileSync(path.join(OUT, "results.json"), JSON.stringify(out, null, 2));
  for (const r of out[0].rows) {
    console.log(
      (r.shape + " ".repeat(34)).slice(0, 34),
      "load=", r.loadThrew === false ? "ok" : "THREW",
      "keys=", r.keysAfterLoad,
      "bank=", r.bankAfterLoad,
      "bankOnDiskAfterSet=", r.bankOnDiskAfterSet,
      "replaced=", r.replacedOnDisk,
      "backups=", JSON.stringify(r.backups),
    );
  }
  console.log(JSON.stringify(out[1], null, 2));
})().catch((e) => {
  console.error("FAILED", e);
  process.exit(1);
});
