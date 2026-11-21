/**
 * audit/run-1/area-E/scripts/csv-check.cjs <exportFolder>
 *
 * Asserts the exporter's bytes on two separate counts.
 *
 * 1. ROUND-TRIP. An RFC 4180 parser written here (not the product's) reads
 *    each CSV back and the decoded cells are compared with the values the
 *    stub fed in. Commas, doubled quotes, embedded CRLF, the UTF-8 BOM, emoji
 *    and RTL text must all survive.
 *
 * 2. FORMULA INJECTION. Any cell whose first character is one of = + - @ or a
 *    leading tab/CR is a formula to Excel, Google Sheets and LibreOffice, and
 *    wrapping the field in quotes does not change that: the quotes are CSV
 *    syntax, stripped before the cell is evaluated. The product's only defence
 *    is quoting (src/lib/channel.ts rowsToCsv, server/csv.ts csvCell), so this
 *    reports every such cell.
 */
const fs = require("node:fs");
const path = require("node:path");

function parseCsv(text) {
  let s = text;
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  const rows = [];
  let row = [];
  let cell = "";
  let i = 0;
  let inQ = false;
  while (i < s.length) {
    const c = s[i];
    if (inQ) {
      if (c === '"') {
        if (s[i + 1] === '"') { cell += '"'; i += 2; continue; }
        inQ = false; i += 1; continue;
      }
      cell += c; i += 1; continue;
    }
    if (c === '"') { inQ = true; i += 1; continue; }
    if (c === ",") { row.push(cell); cell = ""; i += 1; continue; }
    if (c === "\r" && s[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i += 2; continue; }
    if (c === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i += 1; continue; }
    cell += c; i += 1;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const FORMULA = /^[=+\-@\t\r]/;

const dir = process.argv[2];
if (!dir) { console.error("usage: csv-check.cjs <exportFolder>"); process.exit(2); }

const report = { dir, files: {}, injection: [], roundTrip: {} };

for (const name of fs.readdirSync(dir).filter((n) => n.endsWith(".csv"))) {
  const buf = fs.readFileSync(path.join(dir, name));
  const text = buf.toString("utf8");
  const rows = parseCsv(text);
  const header = rows[0];
  const body = rows.slice(1);
  report.files[name] = {
    bytes: buf.length,
    bom: buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf,
    crlf: text.includes("\r\n"),
    columns: header.length,
    dataRows: body.length,
    ragged: body.filter((r) => r.length !== header.length).length,
  };
  for (const [ri, r] of body.entries()) {
    for (const [ci, v] of r.entries()) {
      if (FORMULA.test(v)) {
        report.injection.push({
          file: name, row: ri + 2, column: header[ci], firstChar: JSON.stringify(v[0]),
          value: v.slice(0, 90),
        });
      }
    }
  }
}

// What the stub fed in, as the audit wrote it. Every one of these must come
// back out of the parser byte for byte.
const EXPECT = {
  title: 'Comma, then "quoted", then =SUM(1+1)+cmd|\' /C calc\'!A1 then 🎬 then שלום עולם',
  comment: 'line one\nline two, with "quotes" and =HYPERLINK("http://evil.invalid","x") 😀 مرحبا',
  author: 'A, "B" 😀',
  caption: '=1+1, "quoted" caption 🎬 עברית',
  tags: 'tag, with comma; tag "quoted"',
};

function findCell(file, column, pred) {
  const rows = parseCsv(fs.readFileSync(path.join(dir, file), "utf8"));
  const ci = rows[0].indexOf(column);
  if (ci < 0) return { ok: false, why: "no such column " + column };
  for (const r of rows.slice(1)) if (pred(r[ci])) return { ok: true, value: r[ci] };
  return { ok: false, why: "no matching cell", sample: rows[1] ? rows[1][ci] : null };
}

const checks = [
  ["videos.csv", "title", EXPECT.title],
  ["videos.csv", "tags", EXPECT.tags],
  ["comments.csv", "text", EXPECT.comment],
  ["comments.csv", "author", EXPECT.author],
  ["transcripts.csv", "text", EXPECT.caption],
  ["video-status.csv", "title", EXPECT.title],
];
for (const [file, col, want] of checks) {
  if (!fs.existsSync(path.join(dir, file))) {
    report.roundTrip[`${file}:${col}`] = "file absent";
    continue;
  }
  const got = findCell(file, col, (v) => v === want);
  report.roundTrip[`${file}:${col}`] = got.ok
    ? "EXACT MATCH"
    : { MISMATCH: got.why, sampleBytes: got.sample == null ? null : Buffer.from(String(got.sample), "utf8").toString("hex").slice(0, 160), want };
}

report.verdict = {
  roundTripFailures: Object.entries(report.roundTrip).filter(([, v]) => v !== "EXACT MATCH").length,
  formulaCells: report.injection.length,
  formulaColumns: [...new Set(report.injection.map((i) => `${i.file}/${i.column}`))],
};
console.log(JSON.stringify(report, null, 2));
